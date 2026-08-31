# VoxGuard — Team Task Tracker

> **Last Updated:** 30 Aug 2026 | **Deadline:** 5 Sep 2026

---

## 🟦 Laptop A (Backend Developer) — ✅ COMPLETED

All backend work is done. The following features are live:

- [x] FastAPI server with CORS middleware
- [x] `POST /api/analyze/forensic` — Full file analysis with XAI spectrogram generation
- [x] `WS /ws/analyze/live` — Real-time WebSocket with 6-second sliding window
- [x] `GET /api/history` — Scan history from SQLite
- [x] API Key authentication (`X-API-Key: SIH-VOX-2026`)
- [x] Rate limiting (10 req/min via SlowAPI)
- [x] 100MB file size cap + 9 audio format validation
- [x] Graceful AI crash handling (returns `MANUAL_REVIEW` instead of 500)
- [x] Policy engine (HIGH_RISK → MFA, SUSPICIOUS → WARN, SAFE → ALLOW)
- [x] Explainable AI spectrogram integration
- [x] SQLite database logging for scan history

---

## 🟩 Laptop B (Frontend Developer) — 🔴 ACTION REQUIRED

> **Read `API_CONTRACT.md` before starting.** It contains the exact JSON schemas and code snippets.

### 1. Update `src/utils/api.js`
- [ ] Add `X-API-Key: SIH-VOX-2026` header to ALL fetch/axios requests
- [ ] Change the endpoint from `/api/analyze` to `/api/analyze/forensic`
- [ ] Add a WebSocket connection to `ws://localhost:8000/ws/analyze/live`

### 2. Build the Dashboard UI
- [ ] **File Upload Panel** — Drag-and-drop audio file → hits `POST /api/analyze/forensic`
- [ ] **Live Intercept Button** — Activates microphone using `RecordRTC`, streams `.wav` chunks every 2 seconds over WebSocket
- [ ] **Risk Gauge** — Animated dial/meter that updates in real-time from WebSocket responses
- [ ] **Spectrogram Viewer** — Displays the XAI heatmap image from `spectrogram_url`
- [ ] **History Table** — Fetches and displays past scans from `GET /api/history`

### 3. Quick Reference Code (copy-paste into `api.js`)

**Forensic Upload:**
```javascript
const formData = new FormData();
formData.append("file", audioFile);
formData.append("caller_id", "CALLER-001");
formData.append("amount", "50000");

const res = await fetch("http://localhost:8000/api/analyze/forensic", {
    method: "POST",
    headers: { "X-API-Key": "SIH-VOX-2026" },
    body: formData
});
const data = await res.json();
```

**Live WebSocket:**
```javascript
const ws = new WebSocket("ws://localhost:8000/ws/analyze/live");

// Every 2 seconds, send a .wav blob from RecordRTC
recorder.ondataavailable = (blob) => {
    ws.send(blob);
};

// Receive live risk scores
ws.onmessage = (e) => {
    const data = JSON.parse(e.data);
    updateRiskGauge(data.overall_risk_score);
    updateLabel(data.label);
};
```

---

## 🟨 Laptop C (ML)

**Status:** 🟡 **URGENT ACTION REQUIRED**

Your ML logic works perfectly in isolation, but there is a critical caching bug in `ml/inference.py` that breaks the Dual-Model Architecture when the Backend runs the Fast Model and Heavy Model concurrently.

#### 🔴 Urgent Fix Required: Dictionary Caching
Currently, `_DEFAULT_DETECTOR` is a single global variable. If the WebSockets (Fast Model) and Forensic Uploads (Heavy Model) are hit at the same time, your code will constantly destroy and reload Gigabytes of models into RAM, crashing the server.

**Please change lines 421-427 in `ml/inference.py`:**

**FROM:**
```python
_DEFAULT_DETECTOR: Optional[DeepfakeVoiceDetector] = None

def get_detector(model_name: Optional[str] = None) -> DeepfakeVoiceDetector:
    """Returns or initializes a singleton DeepfakeVoiceDetector instance."""
    global _DEFAULT_DETECTOR
    if _DEFAULT_DETECTOR is None or (model_name and _DEFAULT_DETECTOR.model_name != model_name):
        _DEFAULT_DETECTOR = DeepfakeVoiceDetector(model_name=model_name)
    return _DEFAULT_DETECTOR
```

**TO:**
```python
_DETECTORS: dict = {}

def get_detector(model_name: Optional[str] = None) -> DeepfakeVoiceDetector:
    """Returns or initializes a cached DeepfakeVoiceDetector instance."""
    global _DETECTORS
    # Resolve the default model name if none is provided
    target_name = model_name or DeepfakeVoiceDetector.PRIMARY_MODEL
    
    if target_name not in _DETECTORS:
        _DETECTORS[target_name] = DeepfakeVoiceDetector(model_name=target_name)
    return _DETECTORS[target_name]
```

#### ✅ Previously Completed
- [x] `inference.py` — Deepfake voice detection using HuggingFace Wav2Vec2
- [x] `spectrogram.py` — XAI heatmap visualization generator
- [x] `telecom_noise.py` — Audiomentations noise simulator
- [x] Accepts `np.ndarray` directly for zero-latency WebSocket inference
- [x] `requirements.txt` — All ML dependencies listed

---

## 🔗 API Quick Reference

| Method | Endpoint | Auth | Rate Limit | Description |
|--------|----------|------|------------|-------------|
| `POST` | `/api/analyze/forensic` | `X-API-Key` | 10/min | Full forensic analysis + XAI heatmap |
| `WS`   | `/ws/analyze/live` | None | None | Real-time streaming with sliding window |
| `GET`  | `/api/history` | `X-API-Key` | 10/min | Last 20 scan results |
