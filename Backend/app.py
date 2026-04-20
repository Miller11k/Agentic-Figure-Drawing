# app.py
import os
import sys
import asyncio
import signal
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Response, File, UploadFile, Form, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
from dotenv import load_dotenv
import uvicorn
from pathlib import Path
from image_generation import process_image, process_prompt, list_models

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

@app.get("/models")
def get_models():
    server_url = os.getenv("SERVER_URL")
    if not server_url:
        raise HTTPException(status_code=500, detail="SERVER_URL not configured")
    try:
        models = list_models(server_url)
        return {"models": models}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch models: {str(e)}")

@app.post("/generate/image")
async def handle_generate_image(
    prompt_text: str = Form(...),
    input_image: Optional[UploadFile] = File(None),
    model_name: Optional[str] = Form(None),
    denoise_val: float = Form(0.65),
    seed: Optional[int] = Form(None),
    steps: int = Form(20),
    cfg: float = Form(8.0),
    sampler: str = Form("euler"),
    scheduler: str = Form("normal"),
    denoise: float = Form(0.6)
):
    model = model_name or os.getenv("MODEL")
    server_url = os.getenv("SERVER_URL")

    try:
        if input_image:
            # 1. Read bytes directly from the upload (No temp file!)
            image_content = await input_image.read()
            
            # 2. Run the blocking process_image in a separate thread
            result = await run_in_threadpool(
                process_image,
                model_name=model,
                denoise_val=denoise_val,
                prompt_text=prompt_text,
                server_url=server_url,
                input_image=image_content, # Pass bytes directly
                seed=seed,
                steps=steps,
                cfg=cfg,
                sampler=sampler,
                scheduler=scheduler,
                denoise=denoise
            )
        else:
            # 3. Run the blocking process_prompt in a separate thread
            result = await run_in_threadpool(
                process_prompt,
                model_name=model,
                prompt_text=prompt_text,
                server_url=server_url,
                # Note: Ensure your process_prompt accepts these args!
                width=512, 
                height=512,
                seed=seed,
                steps=steps,
                cfg=cfg,
                sampler=sampler,
                scheduler=scheduler
            )

        if not result:
            raise HTTPException(status_code=500, detail="ComfyUI returned no data.")

        # 4. Return the raw bytes as an image response
        return Response(content=result, media_type="image/png")

    except Exception as e:
        # log.error(f"Error during generation: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")

def handle_sigint():
    log.debug("SIGINT received. Shutting down gracefully...")
    # uvicorn handles the actual shutdown, lifespan cleanup runs automatically


if __name__ == "__main__":
    # Get the absolute path to the project root (one level up from Backend)
    root_path = str(Path(__file__).parent.parent)
    if root_path not in sys.path:
        sys.path.append(root_path)

    port = int(os.getenv("API_PORT", 9988))
    import uvicorn
    uvicorn.run(
        "app:app",  # Now it can find the 'Backend' module
        host="0.0.0.0",
        port=port,
        reload=os.getenv("NODE_ENV") != "production"
    )