from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request, Depends, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.security import APIKeyHeader
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from database import save_scan, get_recent_scans
from policy import calculate_risk_and_action
import os
import sys
import io
import uuid
import shutil
import logging
import numpy as np
import soundfile as sf

logger = logging.getLogger("VoxGuardBackend")

# Add ml folder to path
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "ml"))
from inference import predict
from spectrogram import generate_xai_visualization

app = FastAPI(
    title="VoxGuard API",
    description="AI-Powered Real-Time Voice Cloning Detection & Prevention",
    version="2.0"
)

# ----------------- SECURITY: Rate Limiter -----------------
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ----------------- SECURITY: API Key Auth -----------------
API_KEY_NAME = "X-API-Key"
API_KEY_VALUE = "SIH-VOX-2026"
api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=True)

async def verify_api_key(api_key: str = Depends(api_key_header)):
    if api_key != API_KEY_VALUE:
        raise HTTPException(status_code=401, detail="Unauthorized: Invalid API Key")
    return api_key

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_methods=["*"],
    allow_headers=["*"],
)

# Robust path resolution
BASE_DIR = os.path.dirname(__file__)
DATA_DIR = os.path.join(BASE_DIR, "..", "data")
UPLOADS_DIR = os.path.join(DATA_DIR, "uploads")
SPECTROGRAMS_DIR = os.path.join(DATA_DIR, "spectrograms")

os.makedirs(UPLOADS_DIR, exist_ok=True)
os.makedirs(SPECTROGRAMS_DIR, exist_ok=True)

# Serve the spectrogram images to the React app
app.mount("/spectrograms", StaticFiles(directory=SPECTROGRAMS_DIR), name="spectrograms")

MAX_FILE_SIZE_MB = 100
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

# STEP B: Forensic Endpoint (Heavy Model + XAI)
@app.post("/api/analyze/forensic")
@limiter.limit("10/minute")
async def analyze_forensic(request: Request, file: UploadFile = File(...), caller_id: str = Form("Unknown"), amount: str = Form("0"), api_key: str = Depends(verify_api_key)):
    
    # 1. Expanded Allow-list
    valid_extensions = [".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aac", ".opus", ".amr", ".wma"]
    if not any(file.filename.lower().endswith(ext) for ext in valid_extensions):
        raise HTTPException(status_code=400, detail=f"Bad Request: Allowed extensions are {', '.join(valid_extensions)}")

    # 2. 100MB File Size Limit
    file.file.seek(0, os.SEEK_END)
    file_size = file.file.tell()
    file.file.seek(0)
    
    if file_size > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=413, detail=f"Payload Too Large: File exceeds the {MAX_FILE_SIZE_MB}MB limit.")

    # Save the uploaded file with UUID prefix to prevent collisions
    safe_filename = f"{uuid.uuid4().hex[:8]}_{file.filename}"
    upload_path = os.path.join(UPLOADS_DIR, safe_filename)
    try:
        with open(upload_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        logger.error(f"Failed to save file: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error: Failed to process uploaded file.")

    # Generate Explainable AI (XAI) Spectrogram
    output_png_path = os.path.join(SPECTROGRAMS_DIR, f"{safe_filename}.png")
    try:
        generate_xai_visualization(upload_path, output_png_path)
    except Exception as e:
        logger.error(f"XAI visualization failed: {e}")
        # Note: We don't crash here. If visualization fails, the PDF just lacks the image.

    # 3. Graceful Degradation for AI Crashes
    try:
        result = predict(upload_path)
        # Use the ML model's own rich labels (more sophisticated than policy.py)
        deepfake_prob = result.get("deepfake_probability", 0.0)
        speaker_match_score = result.get("speaker_match_score", 0.12)
        metadata_risk_flag = result.get("metadata_risk_flag", True)
        label = result.get("label", "UNKNOWN")
        recommended_action = result.get("recommended_action", "MANUAL_REVIEW")
        overall_risk_score = result.get("overall_risk_score", 50)
    except Exception as e:
        logger.error(f"ML Inference failed: {e}")
        # ENTERPRISE FALLBACK: Return safe defaults when AI crashes
        deepfake_prob = -1.0
        speaker_match_score = -1.0
        metadata_risk_flag = True
        label = "ANALYSIS_FAILED"
        recommended_action = "MANUAL_REVIEW"
        overall_risk_score = 50
    
    save_scan(
        filename=file.filename,
        deepfake_prob=deepfake_prob,
        speaker_match=speaker_match_score,
        action_taken=recommended_action
    )
    
    return {
        "filename": file.filename,
        "deepfake_probability": deepfake_prob,
        "speaker_match_score": speaker_match_score,
        "metadata_risk_flag": metadata_risk_flag,
        "overall_risk_score": overall_risk_score,
        "label": label,
        "recommended_action": recommended_action,
        "spectrogram_url": f"/spectrograms/{safe_filename}.png"
    }

@app.get("/api/history")
@limiter.limit("10/minute")
def history(request: Request, api_key: str = Depends(verify_api_key)):
    return get_recent_scans()


# =====================================================================
# STEP C: Real-Time Live Intercept via WebSocket
# =====================================================================
# The 6-Second Sliding Window Architecture:
#   - Laptop B (Frontend) records microphone audio using RecordRTC
#   - Every 2 seconds, it sends a raw .wav binary blob over this WebSocket
#   - We strip the WAV header, extract PCM frames, append to a rolling buffer
#   - Buffer is capped at 6 seconds (96,000 samples @ 16kHz) for constant speed
#   - We pass the buffer (np.ndarray) directly to Laptop C's predict() in RAM
#   - We stream back a live JSON risk score instantly
# =====================================================================

TARGET_SR = 16000           # Standard sample rate for speech models
MAX_BUFFER_SECONDS = 6      # Fixed sliding window size
MAX_BUFFER_SAMPLES = TARGET_SR * MAX_BUFFER_SECONDS  # 96,000 samples


@app.websocket("/ws/analyze/live")
async def websocket_live_analyze(websocket: WebSocket):
    await websocket.accept()
    logger.info("WebSocket connection opened for live analysis.")

    # Initialize the stateful sliding window buffer (empty at call start)
    audio_buffer = np.array([], dtype=np.float32)
    chunk_count = 0

    try:
        while True:
            # 1. Receive raw binary .wav data from Laptop B
            raw_bytes = await websocket.receive_bytes()
            chunk_count += 1

            # 2. Strip WAV header: extract only raw PCM audio frames
            try:
                bio = io.BytesIO(raw_bytes)
                chunk_audio, chunk_sr = sf.read(bio, dtype="float32")

                # Convert stereo to mono if needed
                if chunk_audio.ndim > 1:
                    chunk_audio = np.mean(chunk_audio, axis=1)

                # Resample to 16kHz if the browser recorded at a different rate
                if chunk_sr != TARGET_SR:
                    try:
                        import librosa
                        chunk_audio = librosa.resample(chunk_audio, orig_sr=chunk_sr, target_sr=TARGET_SR)
                    except ImportError:
                        # Fallback: simple decimation (less accurate but no extra dependency)
                        ratio = TARGET_SR / chunk_sr
                        indices = np.round(np.arange(0, len(chunk_audio), 1 / ratio)).astype(int)
                        indices = indices[indices < len(chunk_audio)]
                        chunk_audio = chunk_audio[indices]

            except Exception as e:
                logger.warning(f"Failed to decode audio chunk #{chunk_count}: {e}")
                await websocket.send_json({
                    "error": "Failed to decode audio chunk",
                    "chunk": chunk_count
                })
                continue

            # 3. Append new audio to the sliding window buffer
            audio_buffer = np.concatenate([audio_buffer, chunk_audio])

            # 4. Enforce the 6-second cap (drop oldest audio from the front)
            if len(audio_buffer) > MAX_BUFFER_SAMPLES:
                audio_buffer = audio_buffer[-MAX_BUFFER_SAMPLES:]

            buffer_duration = round(len(audio_buffer) / TARGET_SR, 2)

            # 5. Run ML inference directly on the in-memory NumPy array
            try:
                result = predict(audio_buffer)

                deepfake_prob = result.get("deepfake_probability", 0.0)
                speaker_match_score = result.get("speaker_match_score", 0.12)
                label = result.get("label", "UNKNOWN")
                overall_risk_score = result.get("overall_risk_score", 0)
                recommended_action = result.get("recommended_action", "ALLOW")

            except Exception as e:
                logger.error(f"Live ML inference failed on chunk #{chunk_count}: {e}")
                deepfake_prob = -1.0
                speaker_match_score = -1.0
                label = "ANALYSIS_FAILED"
                overall_risk_score = 50
                recommended_action = "MANUAL_REVIEW"

            # 6. Stream the live risk score back to the frontend
            await websocket.send_json({
                "chunk": chunk_count,
                "buffer_duration_seconds": buffer_duration,
                "deepfake_probability": deepfake_prob,
                "speaker_match_score": speaker_match_score,
                "overall_risk_score": overall_risk_score,
                "label": label,
                "recommended_action": recommended_action
            })

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected after {chunk_count} chunks.")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        try:
            await websocket.close(code=1011, reason=str(e))
        except Exception:
            pass
