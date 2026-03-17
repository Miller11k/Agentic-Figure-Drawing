# app.py
import os
import asyncio
import signal
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import uvicorn

load_dotenv()

logging.basicConfig(level=logging.DEBUG)
log = logging.getLogger(__name__)

active_connections = 0
shutdown_requested = False

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    log.debug("Starting up...")
    # e.g. await connect_db()
    yield
    # Shutdown
    log.debug("Shutting down...")
    # e.g. await disconnect_db()

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def track_connections(request: Request, call_next):
    global active_connections
    active_connections += 1
    log.debug(f"Incoming: {request.method} {request.url} | Active: {active_connections}")

    try:
        response = await call_next(request)
    finally:
        active_connections = max(0, active_connections - 1)
        log.debug(f"Finished: {request.method} {request.url} | Active: {active_connections}")

    return response


@app.get("/api/health")
def health():
    return {"status": "ok"}


def handle_sigint():
    log.debug("SIGINT received. Shutting down gracefully...")
    # uvicorn handles the actual shutdown, lifespan cleanup runs automatically


if __name__ == "__main__":
    port = int(os.getenv("API_PORT", 9988))
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=port,
        reload=os.getenv("NODE_ENV") != "production"
    )