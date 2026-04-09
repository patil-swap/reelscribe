import os
import asyncio
import uuid
import yt_dlp
from groq import Groq
try:
    from deepgram import DeepgramClient, PrerecordedOptions
except ImportError:
    # Fallback for Deepgram SDK v6+
    from deepgram import DeepgramClient
    PrerecordedOptions = None

from typing import Optional, List, Dict, Any
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize clients (keys will be loaded from env in main.py)
groq_client: Optional[Groq] = None
deepgram_client: Optional[DeepgramClient] = None

def init_clients(groq_key: str, deepgram_key: str):
    global groq_client, deepgram_client
    if groq_key:
        groq_client = Groq(api_key=groq_key)
    if deepgram_key:
        deepgram_client = DeepgramClient(api_key=deepgram_key)

async def extract_audio_from_url(url: str) -> str:
    """
    Extracts audio from a URL using yt-dlp and saves it as an mp3 in /tmp.
    Returns the path to the extracted file.
    """
    unique_id = uuid.uuid4().hex
    output_template = f"/tmp/reelscribe_{unique_id}.%(ext)s"
    
    ydl_opts = {
        'format': 'bestaudio/best',
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
        'outtmpl': output_template,
        'quiet': True,
        'no_warnings': True,
    }

    def run_ydl():
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            return ydl.prepare_filename(info).replace('.webm', '.mp3').replace('.m4a', '.mp3')

    # Run in a thread to not block the event loop
    loop = asyncio.get_event_loop()
    try:
        file_path = await loop.run_in_executor(None, run_ydl)
        # Ensure the filename is correct for the .mp3 version
        if not file_path.endswith('.mp3'):
            file_base = os.path.splitext(file_path)[0]
            file_path = f"{file_base}.mp3"
        return file_path
    except Exception as e:
        logger.error(f"yt-dlp extraction failed: {str(e)}")
        if "ffmpeg" in str(e).lower() or "ffprobe" in str(e).lower():
            raise Exception("SYSTEM ERROR: ffmpeg and ffprobe not found. Please run 'sudo apt update && sudo apt install ffmpeg' on the server.")
        raise Exception("Couldn't extract audio. The link may be private or unsupported.")

async def get_video_info(url: str) -> Dict[str, Any]:
    """
    Fetches video metadata using yt-dlp without downloading.
    """
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'skip_download': True,
    }
    
    def run_ydl_info():
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            return ydl.extract_info(url, download=False)

    loop = asyncio.get_event_loop()
    try:
        info = await loop.run_in_executor(None, run_ydl_info)
        return {
            "title": info.get("title"),
            "channel": info.get("uploader") or info.get("channel"),
            "thumbnail_url": info.get("thumbnail"),
            "duration": info.get("duration"),
            "view_count": info.get("view_count")
        }
    except Exception as e:
        logger.error(f"Metadata fetch failed: {str(e)}")
        raise Exception("Failed to fetch video information.")

async def transcribe_audio(file_path: str, model: str = "large-v3", include_timestamps: bool = True) -> Dict[str, Any]:
    """
    Transcribes an audio file using Groq, with fallback to Deepgram.
    """
    try:
        # 1. Try Groq
        if groq_client:
            logger.info(f"Attempting transcription with Groq: {model}")
            result = await transcribe_with_groq(file_path, model, include_timestamps)
            return {**result, "model_used": f"Groq ({model})"}
    except Exception as groq_error:
        logger.warning(f"Groq transcription failed, falling back to Deepgram: {str(groq_error)}")
        # If Groq fails (rate limit, timeout, etc.), fallback to Deepgram
        try:
            if deepgram_client:
                logger.info("Deepgram fallback initiated")
                result = await transcribe_with_deepgram(file_path)
                return {**result, "model_used": "Deepgram (fallback - Nova-2)"}
        except Exception as dg_error:
            logger.error(f"Deepgram fallback also failed: {str(dg_error)}")
            raise Exception("Transcription is temporarily unavailable. Try again shortly.")

    raise Exception("No transcription service available.")

async def transcribe_with_groq(file_path: str, model: str, include_timestamps: bool) -> Dict[str, Any]:
    """Helper to call Groq API"""
    with open(file_path, "rb") as file:
        def call_groq():
            return groq_client.audio.transcriptions.create(
                file=(os.path.basename(file_path), file.read()),
                model=model,
                response_format="verbose_json" if include_timestamps else "json",
            )

        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(None, call_groq)
        
        # Verbose JSON contains segments
        if hasattr(response, 'segments'):
            segments = [
                {"start": s.get("start"), "end": s.get("end"), "text": s.get("text")} 
                for s in response.segments
            ]
        else:
            segments = []

        return {
            "transcript": response.text,
            "segments": segments,
            "duration": response.duration if hasattr(response, 'duration') else 0
        }

async def transcribe_with_deepgram(file_path: str) -> Dict[str, Any]:
    """Helper to call Deepgram API"""
    with open(file_path, "rb") as file:
        payload = {"buffer": file.read()}
        
        # Build options as a dict for maximum compatibility across SDK versions
        options = {
            "model": "nova-2",
            "smart_format": True,
            "utterances": True,
            "punctuate": True,
            "diarize": False,
        }
        
        # Try multiple calling patterns for different SDK versions
        try:
            # SDK v6+ pattern (based on inspection: only keyword-only arguments)
            response = await deepgram_client.listen.v1.media.transcribe_file(
                request=payload,
                **options
            )
        except Exception as e6:
            try:
                # SDK v3+ pattern fallback
                response = await deepgram_client.listen.prerecorded.v("1").transcribe_file(payload, options)
            except Exception as e3:
                logger.error(f"All Deepgram call patterns failed. v6_err: {e6}, v3_err: {e3}")
                raise e6
        
        # Parse result (Deepgram SDK v6 returns ListenV1Response object)
        try:
            # Attempt to access as object first (SDK v6)
            result = response.results.channels[0].alternatives[0]
            transcript = result.transcript
            words = result.words
            duration = response.metadata.duration
        except (AttributeError, TypeError):
            # Fallback for dict-like access or older SDKs
            res_dict = response if isinstance(response, dict) else response.to_dict()
            result = res_dict["results"]["channels"][0]["alternatives"][0]
            transcript = result.get("transcript", "")
            words = result.get("words", [])
            duration = res_dict.get("metadata", {}).get("duration", 0)
        
        # Deepgram gives words, group into rough segments
        segments = []
        for i in range(0, len(words), 10):
            chunk = words[i:i+10]
            segments.append({
                "start": chunk[0].get("start", 0),
                "end": chunk[-1].get("end", 0),
                "text": " ".join([w.get("word", "") for w in chunk])
            })

        return {
            "transcript": transcript,
            "segments": segments,
            "duration": duration
        }
