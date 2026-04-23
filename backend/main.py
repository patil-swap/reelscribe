import os
import shutil
import uuid
from fastapi import FastAPI, Request, UploadFile, File, Form, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from dotenv import load_dotenv
import logging
from typing import Optional, List
from pydantic import BaseModel, field_validator
from fastapi.responses import JSONResponse, FileResponse

try:
    import services
except ImportError as e:
    if 'services' in str(e):
        from . import services
    else:
        raise e

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Rate Limiter
def get_real_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    from slowapi.util import get_remote_address
    return get_remote_address(request)

limiter = Limiter(key_func=get_real_ip)
frontend_path = os.path.join(os.path.dirname(__file__), "..", "frontend")
app = FastAPI(title="ReelScribe API")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Custom Error Page Handlers
@app.exception_handler(404)
async def custom_404_handler(request: Request, __):
    return FileResponse(os.path.join(frontend_path, "errors", "404.html"), status_code=404)

@app.exception_handler(500)
async def custom_500_handler(request: Request, __):
    return FileResponse(os.path.join(frontend_path, "errors", "500.html"), status_code=500)

@app.exception_handler(RateLimitExceeded)
async def custom_rate_limit_handler(request: Request, __):
    return FileResponse(os.path.join(frontend_path, "errors", "429.html"), status_code=429)

class ScriptRequest(BaseModel):
    sources: List[str]
    userPrompt: str
    length: str
    blend: float

    @field_validator('sources')
    @classmethod
    def validate_sources(cls, v):
        if len(v) > 10:
            raise ValueError('Maximum 10 sources allowed')
        for s in v:
            if len(s) > 50000:
                raise ValueError('Each source must be under 50,000 characters')
        return v

# CORS Configuration
allowed_origin = os.getenv("ALLOWED_ORIGIN")
if not allowed_origin:
    raise RuntimeError("ALLOWED_ORIGIN must be set. Use '*' explicitly for local dev.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[allowed_origin] if allowed_origin != "*" else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/config")
async def get_config():
    """Serves non-sensitive public configuration to the frontend."""
    return {
        "GOOGLE_CLIENT_ID": os.getenv("GOOGLE_CLIENT_ID", "")
    }

# Initialize Services
services.init_clients(
    groq_key=os.getenv("GROQ_API_KEY"),
    deepgram_key=os.getenv("DEEPGRAM_API_KEY")
)

MAX_UPLOAD_SIZE = int(os.getenv("MAX_UPLOAD_MB", "50")) * 1024 * 1024
SUPPORTED_FORMATS = ["audio/mpeg", "audio/wav", "audio/mp4", "audio/x-m4a", "video/mp4", "audio/ogg"]

@app.get("/health")
async def health_check():
    return {"status": "ok"}

@app.get("/video-info")
@limiter.limit("10/15minutes") # Slightly more generous for info
async def video_info(request: Request, url: str):
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")
    try:
        info = await services.get_video_info(url)
        return info
    except Exception as e:
        logger.error(f"Error fetching video info: {str(e)}")
        raise HTTPException(status_code=422, detail="Couldn't extract video info. Private or unsupported link.")

@app.post("/transcribe")
@limiter.limit("5/15minutes")
async def transcribe(
    request: Request,
    file: Optional[UploadFile] = File(None),
    url: Optional[str] = Form(None),
    model: str = Form("large-v3-turbo"),
    timestamps: bool = Form(True),
    language: Optional[str] = Form(None)
):
    temp_file_path = None
    try:
        # 1. Validation
        if not file and not url:
            raise HTTPException(status_code=400, detail="Either file or url must be provided.")

        # 2. Handle File Upload
        if file:
            # Check file size
            file.file.seek(0, os.SEEK_END)
            size = file.file.tell()
            file.file.seek(0)
            if size > MAX_UPLOAD_SIZE:
                raise HTTPException(status_code=413, detail="File exceeds 50MB limit. Try compressing it first.")
            
            # Check format
            if file.content_type not in SUPPORTED_FORMATS:
                raise HTTPException(status_code=415, detail="Format not supported. Use mp3, mp4, wav, or m4a.")
            
            # Save to /tmp
            temp_file_path = f"/tmp/{uuid_name()}_{file.filename}"
            with open(temp_file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

        # 3. Handle URL
        elif url:
            try:
                temp_file_path = await services.extract_audio_from_url(url)
            except Exception as e:
                raise HTTPException(status_code=422, detail=str(e))

        # 4. Transcription
        if not temp_file_path or not os.path.exists(temp_file_path):
            raise HTTPException(status_code=500, detail="Failed to prepare file for transcription.")

        result = await services.transcribe_audio(temp_file_path, model, timestamps, language)
        return result

    except HTTPException as he:
        raise he
    except Exception as e:
        logger.exception("Unexpected error during transcription")
        # Map specific exceptions if needed, otherwise generic 500
        if "rate limit" in str(e).lower():
            raise HTTPException(status_code=429, detail="Too many requests. Wait a moment and try again.")
        if "timeout" in str(e).lower():
            raise HTTPException(status_code=504, detail="Transcription timed out. Try a shorter file.")
        
        raise HTTPException(status_code=500, detail="An internal server error occurred.")
    
    finally:
        # 5. Cleanup /tmp always
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
                logger.info(f"Cleaned up temp file: {temp_file_path}")
            except Exception as cleanup_error:
                logger.error(f"Failed to delete temp file {temp_file_path}: {str(cleanup_error)}")

@app.post("/generate-script")
@limiter.limit("20/15minutes")
async def generate_script_endpoint(request: Request, body: ScriptRequest):
    try:
        result = await services.generate_script(
            sources=body.sources,
            user_prompt=body.userPrompt,
            length=body.length,
            blend=body.blend
        )
        return result
    except Exception as e:
        logger.error(f"Error generating script: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

def uuid_name():
    return uuid.uuid4().hex

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

# Serve static files from the frontend directory
# This should be at the bottom so it doesn't override API routes
try:
    if os.path.exists(frontend_path):
        app.mount("/static", StaticFiles(directory=frontend_path), name="static")
        app.mount("/", StaticFiles(directory=frontend_path, html=True), name="frontend")
        logger.info(f"Serving frontend from {frontend_path}")
except Exception as e:
    logger.warning(f"Could not mount frontend: {e}")
