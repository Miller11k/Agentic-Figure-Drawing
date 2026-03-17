# Use a lightweight Debian-based image
FROM debian:bullseye-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    nginx \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy project folders
COPY Backend /app/Backend
COPY Frontend /app/Frontend

# Copy nginx config
COPY nginx.conf /etc/nginx/nginx.conf

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Set up Python API
WORKDIR /app/Backend
RUN python3 -m venv venv && \
    . venv/bin/activate && \
    pip install --no-cache-dir -r requirements.txt

# Expose ports
EXPOSE 80
EXPOSE 5000

CMD ["/entrypoint.sh"]