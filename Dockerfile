FROM python:3.11-slim

# Install ffmpeg (needed by yt-dlp and audio processing)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies from the backend requirements
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

# Copy application code. Layout inside the container:
#   /app/backend/   <- main.py lives here, so ../frontend resolves correctly
#   /app/frontend/  <- static assets and error pages
COPY backend /app/backend
COPY frontend /app/frontend

# Run from /app/backend so `import services` etc. work as they do locally
WORKDIR /app/backend

ENV PORT=8080
EXPOSE 8080

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]