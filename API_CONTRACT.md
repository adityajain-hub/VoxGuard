# VoxGuard API Contract v2.0

> **This is the single source of truth.** Both Backend (Laptop A) and Frontend (Laptop B) must follow this strictly. Any deviation will break integration.

---

## 🔐 Authentication (ALL Endpoints)

Every HTTP request **must** include the following header:

```
X-API-Key: SIH-VOX-2026
```

Requests without this header will receive:
```json
{ "detail": "Not authenticated" }
```
**Status:** `401 Unauthorized`

---

## 🚦 Rate Limiting (ALL HTTP Endpoints)

All HTTP endpoints are rate-limited to **10 requests per minute per IP**.

Exceeding this limit will receive:
```json
{ "error": "Rate limit exceeded: 10 per 1 minute" }
```
**Status:** `429 Too Many Requests`

---

## 1. POST /api/analyze/forensic

> **Purpose:** Upload a full audio file for deep forensic analysis using the heavyweight AI model. Generates Explainable AI (XAI) spectrogram heatmaps.

**Request:** `multipart/form-data`
| Field       | Type   | Required | Description                    |
|-------------|--------|----------|--------------------------------|
| `file`      | File   | Yes      | Audio file (.wav, .mp3, .flac, .ogg, .m4a, .aac, .opus, .amr, .wma) |
| `caller_id` | string | No       | Caller identifier (default: "Unknown") |
| `amount`    | string | No       | Transaction amount (default: "0")      |

**Constraints:**
- Max file size: **100MB**
- Only audio extensions listed above are accepted

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
    "spectrogram_url": "/spectrograms/a1b2c3d4_scam_call.wav.png"
}
```

> **Note:** The `spectrogram_url` contains a UUID prefix (e.g., `a1b2c3d4_`) to prevent filename collisions. Use the exact URL returned in the response.

**Error Responses:**
| Status | Condition                          |
|--------|------------------------------------|
| `400`  | Invalid file extension             |
| `401`  | Missing or invalid API key         |
| `413`  | File exceeds 100MB                 |
| `429`  | Rate limit exceeded                |
| `500`  | Server error (file save or AI crash). On AI crash, returns valid JSON with `label: "ANALYSIS_FAILED"` and `recommended_action: "MANUAL_REVIEW"` |

---

## 2. WS /ws/analyze/live

> **Purpose:** Real-time voice cloning detection over a persistent WebSocket connection. Uses the lightweight fast model with a 6-second sliding window for continuous risk scoring.

**Connection URL:**
```
ws://localhost:8000/ws/analyze/live
```

> ⚠️ **No API key required for WebSocket.** Authentication is handled at the frontend application level.

### How It Works (Frontend Instructions for Laptop B):

1. **Connect** to `ws://localhost:8000/ws/analyze/live`
2. **Record** microphone audio using `RecordRTC` in `.wav` format at 16kHz mono
3. **Send** a 2-second `.wav` binary blob every 2 seconds using `websocket.send(blob)`
4. **Receive** a JSON risk score after each chunk is processed
5. **Animate** the Risk Gauge / Dial on the UI using the received scores
6. **Close** the WebSocket when the user clicks "Stop"

### Incoming Data (Frontend → Backend):
- **Format:** Raw binary `.wav` data (2-second chunks)
- **Encoding:** PCM 16-bit or 32-bit float
- **Sample Rate:** 16kHz preferred (backend will resample if different)
- **Channels:** Mono preferred (backend will convert stereo to mono)

### Response Per Chunk (Backend → Frontend):
```json
{
    "chunk": 3,
    "buffer_duration_seconds": 6.0,
    "deepfake_probability": 0.87,
    "speaker_match_score": 0.23,
    "overall_risk_score": 82,
    "label": "HIGH_RISK_IMPERSONATION",
    "recommended_action": "REQUIRE_MFA"
}
```

### Response Fields:
| Field                      | Type    | Description                                                    |
|----------------------------|---------|----------------------------------------------------------------|
| `chunk`                    | int     | Sequential chunk number (1, 2, 3, ...)                         |
| `buffer_duration_seconds`  | float   | Current audio buffer length (grows to max 6.0 seconds)         |
| `deepfake_probability`     | float   | 0.0 (genuine) to 1.0 (fake). `-1.0` means analysis failed     |
| `speaker_match_score`      | float   | 0.0 (no match) to 1.0 (perfect match)                         |
| `overall_risk_score`       | int     | 0 (safe) to 100 (critical risk)                                |
| `label`                    | string  | `AUTHENTIC_CALLER`, `SUSPICIOUS_VOICE`, `HIGH_RISK_IMPERSONATION`, or `ANALYSIS_FAILED` |
| `recommended_action`       | string  | `ALLOW`, `FLAG_FOR_REVIEW`, `REQUIRE_MFA`, or `MANUAL_REVIEW`  |

### Error Response (per chunk):
If a single chunk fails to decode, the WebSocket stays open and returns:
```json
{
    "error": "Failed to decode audio chunk",
    "chunk": 4
}
```

---

## 3. GET /api/history

> **Purpose:** Retrieve the 20 most recent forensic scan results from the database.

**Headers:** `X-API-Key: SIH-VOX-2026`

**Response (JSON):**
```json
[
    {
        "id": 1,
        "filename": "scam_call.wav",
        "deepfake_prob": 0.94,
        "speaker_match": 0.12,
        "action_taken": "REQUIRE_MFA",
        "timestamp": "2026-08-30T23:00:00"
    }
]
```

---

## Quick Reference for Laptop B (Frontend)

### Forensic Upload (File Analysis)
```javascript
const formData = new FormData();
formData.append("file", audioFile);
formData.append("caller_id", "CALLER-001");
formData.append("amount", "50000");

const response = await fetch("http://localhost:8000/api/analyze/forensic", {
    method: "POST",
    headers: { "X-API-Key": "SIH-VOX-2026" },
    body: formData
});
const data = await response.json();
```

### Live Streaming (Real-Time Microphone)
```javascript
const ws = new WebSocket("ws://localhost:8000/ws/analyze/live");

// Every 2 seconds, send a .wav blob from RecordRTC
recorder.ondataavailable = (blob) => {
    ws.send(blob);
};

// Receive live risk scores
ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    updateRiskGauge(data.overall_risk_score);
    updateLabel(data.label);
};
```
