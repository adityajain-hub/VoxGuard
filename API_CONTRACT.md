# VoxGuard API Contract

## POST /api/analyze
**Request:** `multipart/form-data` 
* `file`: (Audio file)
* `caller_id`: string
* `amount`: string

**Response (JSON):**
```json
{
    "filename": "scam_call.wav",
    "deepfake_probability": 0.94,
    "speaker_match_score": 0.12,      
    "metadata_risk_flag": true,
    "overall_risk_score": 95,
    "label": "HIGH_RISK_IMPERSONATION",
    "recommended_action": "REQUIRE_MFA",
    "spectrogram_url": "/spectrograms/scam_call.png"
}
```
