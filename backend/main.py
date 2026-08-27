from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from database import save_scan, get_recent_scans
import os
import shutil

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_methods=["*"],
    allow_headers=["*"],
)

# This serves the spectrogram images to the React app
app.mount("/spectrograms", StaticFiles(directory="../data/spectrograms"), name="spectrograms")

@app.post("/api/analyze")
async def analyze(file: UploadFile = File(...), caller_id: str = Form("Unknown"), amount: str = Form("0")):
    
    # Check the file extension (reject .pdf, .txt)
    if file.filename.endswith(".pdf") or file.filename.endswith(".txt"):
        raise HTTPException(status_code=400, detail="Bad Request: Invalid file extension")

    # Save the uploaded file to ../data/uploads/
    upload_path = os.path.join("..", "data", "uploads", file.filename)
    with open(upload_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Return fake data for now (matches API_CONTRACT.md)
    # Database save logic will be called here
    return {
        "filename": file.filename,
        "deepfake_probability": 0.94,
        "speaker_match_score": 0.12,
        "metadata_risk_flag": True,
        "overall_risk_score": 95,
        "label": "HIGH_RISK_IMPERSONATION",
        "recommended_action": "REQUIRE_MFA",
        "spectrogram_url": f"/spectrograms/{file.filename}.png"
    }

@app.get("/api/history")
def history():
    return get_recent_scans()

