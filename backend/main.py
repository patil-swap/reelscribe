import os
import shutil
import uuid
import hashlib
import glob
import time
import tempfile
from fastapi import FastAPI, Request, UploadFile, File, Form, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from dotenv import load_dotenv
import logging
from typing import Optional, List
from pydantic import BaseModel, field_validator
from fastapi.responses import JSONResponse, FileResponse

# Define frontend_path early to prevent NameError in error handlers
frontend_path = os.path.join(os.path.dirname(__file__), "..", "frontend")

try:
    import services
    import database
    import auth_utils
except ImportError as e:
    if 'services' in str(e) or 'database' in str(e) or 'auth_utils' in str(e):
        from . import services
        from . import database
        from . import auth_utils
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

def get_client_identifier(request: Request) -> tuple[str, bool]:
    """
    Returns (identifier, is_authenticated).
    identifier is either the email (if authenticated) or a device_id hash of IP + fingerprint.
    """
    # 1. Check Auth Header
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        payload = auth_utils.verify_token(token)
        if payload and payload.get("email"):
            email = payload.get("email")
            # Verify user exists
            if database.get_user_by_email(email):
                return email, True

    # 2. Anonymous / Incognito tracking: IP + Fingerprint
    fingerprint = request.headers.get("X-Device-Fingerprint", "unknown")
    client_ip = get_real_ip(request)
    
    # Combine client_ip + fingerprint to make it unique and persistent in incognito
    raw_id = f"{client_ip}:{fingerprint}"
    identifier = hashlib.sha256(raw_id.encode("utf-8")).hexdigest()
    return identifier, False

limiter = Limiter(key_func=get_real_ip)
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

class AuthRequest(BaseModel):
    email: str
    password: str

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
allowed_origin = os.getenv("ALLOWED_ORIGIN", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[allowed_origin] if allowed_origin != "*" else ["*"],
    allow_credentials=False,
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

@app.post("/auth/signup")
async def signup(body: AuthRequest):
    email = body.email.strip().lower()
    if not auth_utils.is_valid_email_provider(email):
        raise HTTPException(status_code=400, detail="Invalid email provider. Disposable or temporary emails are not allowed.")
    
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters long.")
    
    # Check if user already exists
    existing_user = database.get_user_by_email(email)
    if existing_user:
        raise HTTPException(status_code=400, detail="An account with this email already exists.")
    
    # Create user
    pw_hash = database.hash_password(body.password)
    success = database.create_user(email, pw_hash)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to create user. Please try again.")
        
    # Generate token
    token = auth_utils.create_token({"email": email})
    return {"token": token, "email": email}

@app.post("/auth/login")
async def login(body: AuthRequest):
    email = body.email.strip().lower()
    user = database.get_user_by_email(email)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
        
    if not database.verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
        
    token = auth_utils.create_token({"email": email})
    return {"token": token, "email": email}

@app.get("/auth/me")
async def get_me(request: Request):
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = auth_header.split(" ")[1]
    payload = auth_utils.verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
        
    email = payload.get("email")
    user = database.get_user_by_email(email)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
        
    return {"email": email}

@app.get("/transcribe/limit")
async def get_limit(request: Request):
    identifier, is_authenticated = get_client_identifier(request)
    limit = 8 if is_authenticated else 3
    count = database.get_transcription_count(identifier)
    return {
        "is_authenticated": is_authenticated,
        "limit": limit,
        "usage": count,
        "remaining": max(0, limit - count)
    }

@app.get("/video-info")
@limiter.limit("5/15minutes")  # Aligned with PRD
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
    # Check limit first
    identifier, is_authenticated = get_client_identifier(request)
    limit = 8 if is_authenticated else 3
    count = database.get_transcription_count(identifier)
    if count >= limit:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Transcription limit reached ({count}/{limit} used in last 24h). Sign up/in to get +5 extra transcriptions!"
        )

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
            
            # Save to /tmp using tempfile with consistent prefix for cleanup
            suffix = os.path.splitext(file.filename)[1] if file.filename else ""
            temp_file = tempfile.NamedTemporaryFile(
                delete=False,
                prefix="reelscribe_upload_",
                suffix=suffix,
                dir="/tmp"
            )
            temp_file_path = temp_file.name
            with temp_file as buffer:
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
        # Log successful transcription
        if not await request.is_disconnected():
            database.log_transcription(identifier)
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

def cleanup_old_temp_files():
    """
    Removes leftover temporary files in /tmp that are older than 24 hours.
    Called on application startup to handle files from previous crashes.
    """
    patterns = [
        "/tmp/reelscribe_*",          # URL-extracted audio
        "/tmp/reelscribe_upload_*"    # uploaded files
    ]
    cutoff = time.time() - 24 * 3600  # 24 hours ago
    for pattern in patterns:
        for path in glob.glob(pattern):
            try:
                if os.path.isfile(path) and os.path.getmtime(path) < cutoff:
                    os.remove(path)
                    logger.info(f"Cleaned up old temp file: {path}")
            except Exception as e:
                logger.error(f"Failed to clean up old temp file {path}: {e}")

@app.on_event("startup")
async def startup_event():
    cleanup_old_temp_files()
    logger.info("Startup cleanup completed.")

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