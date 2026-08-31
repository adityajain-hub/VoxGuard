# 🛡️ VoxGuard — AI-Powered Real-Time Voice Cloning Detection

> **SIH 2026 Project** | AI-Powered Real-Time Detection and Prevention of Voice Cloning Impersonation Attacks

VoxGuard is an end-to-end security framework that analyzes incoming voice streams in near real-time, determines the likelihood that the caller is using a cloned or AI-generated voice, and provides timely alerts and recommendations before sensitive actions are taken.

---

## 🚀 Current Features (Prototype v2.0)

### 🔐 Enterprise Security
- **API Key Authentication** — All endpoints are locked behind `X-API-Key: SIH-VOX-2026`
- **Rate Limiting** — 10 requests/minute per IP to prevent DDoS attacks (powered by SlowAPI)
- **Graceful Degradation** — If the AI model crashes on corrupted audio, the server stays alive and flags the call for `MANUAL_REVIEW` instead of crashing

### 🧠 Dual-Model Architecture
| Mode | Endpoint | Model | Speed | Use Case |
|------|----------|-------|-------|----------|
| **Forensic** | `POST /api/analyze/forensic` | Wav2Vec2 (Heavy) | 5-10s | Full file upload, XAI heatmaps, PDF reports |
| **Live Stream** | `WS /ws/analyze/live` | Fast Model | <500ms | Real-time microphone interception |

### 🎙️ Real-Time WebSocket Streaming
- **6-Second Sliding Window** — Frontend sends 2-second `.wav` chunks; backend maintains a rolling 6-second audio buffer for maximum AI accuracy with constant processing speed
- **WAV Header Stripping** — Raw PCM extraction from each chunk to prevent audio corruption when stitching
- **Direct Memory Inference** — NumPy arrays passed straight to the AI model in RAM (zero disk I/O)
- **Live Risk Gauge** — Streams back JSON risk scores per chunk for the frontend to animate in real-time

### 📊 Explainable AI (XAI)
- **Spectrogram Heatmaps** — Forensic uploads generate visual heatmap overlays highlighting the exact frequencies that look artificially generated
- Served as static images via `/spectrograms/` for frontend display and PDF export

### 🛡️ Robust Input Validation
- **100MB file size limit** — Rejects oversized files with `413 Payload Too Large`
- **9 audio formats accepted** — `.wav`, `.mp3`, `.flac`, `.ogg`, `.m4a`, `.aac`, `.opus`, `.amr`, `.wma`
- **Invalid file rejection** — Non-audio files are blocked with `400 Bad Request`

### 📜 Scan History
- All forensic scans are logged to a local SQLite database
- `GET /api/history` returns the 20 most recent scan results

---

## 📁 Project Structure

```
VoxGuard/
├── API_CONTRACT.md          # 📜 The rulebook (v2.0) — ALL endpoints documented here
├── README.md                # 📖 You are here
├── .gitignore               # 🚫 Ignores data/, venv/, node_modules/, *.wav, *.db
│
├── backend/                 # 🟦 LAPTOP A (Backend Developer)
│   ├── main.py              # FastAPI server — Forensic API + WebSocket + Security
│   ├── database.py          # SQLAlchemy + SQLite for scan history
│   ├── policy.py            # Threshold alerting logic (MFA / WARN / ALLOW)
│   └── requirements.txt     # Python dependencies
│
├── frontend/                # 🟩 LAPTOP B (Frontend Developer)
│   ├── src/
│   │   ├── App.jsx          # Main Dashboard
│   │   ├── components/      # UI pieces (Upload, Alerts, Spectrogram, RiskGauge)
│   │   └── utils/api.js     # API calls + WebSocket connection
│   ├── package.json
│   └── tailwind.config.js
│
├── ml/                      # 🟨 LAPTOP C (ML Engineer)
│   ├── inference.py         # HuggingFace Wav2Vec2 deepfake detection
│   ├── spectrogram.py       # XAI heatmap visualization generator
│   ├── telecom_noise.py     # Audiomentations noise simulator
│   └── requirements.txt     # ML dependencies (torch, transformers, librosa)
│
└── data/                    # 📦 Shared Storage (NOT pushed to GitHub)
    ├── uploads/             # Temporary incoming audio files
    ├── spectrograms/        # Generated XAI heatmap PNGs
    └── demo_samples/        # Curated real/fake audio clips for the demo
```

---

## ⚙️ Setup Instructions

### Prerequisites
- Python 3.10+
- Node.js 18+ (for frontend)
- Git

### Backend (Laptop A)
```bash
cd backend
python -m venv venv

# Windows
.\venv\Scripts\Activate.ps1

# macOS/Linux
source venv/bin/activate

pip install -r requirements.txt
pip install -r ../ml/requirements.txt

# Run the server
uvicorn main:app --reload
```
The backend will be available at `http://localhost:8000`
Swagger UI docs at `http://localhost:8000/docs`

### Frontend (Laptop B)
```bash
cd frontend
npm install
npm run dev
```
The frontend will be available at `http://localhost:5173`

---

## 📋 Team Task Tracker

> **See [`TASKS.md`](TASKS.md) for the full task breakdown, checklists, and code snippets for each team member.**

| Laptop | Role | Status |
|--------|------|--------|
| 🟦 Laptop A | Backend Developer | ✅ Completed |
| 🟩 Laptop B | Frontend Developer | 🔴 Action Required — see `TASKS.md` |
| 🟨 Laptop C | ML Engineer | ✅ Completed |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    LAPTOP B (Frontend)                   │
│              React + Vite + Tailwind CSS                 │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ File Upload   │  │ Live Mic     │  │ Risk Gauge    │  │
│  │ Panel         │  │ RecordRTC    │  │ + History     │  │
│  └──────┬───────┘  └──────┬───────┘  └───────────────┘  │
│         │ POST             │ WebSocket                   │
└─────────┼─────────────────┼──────────────────────────────┘
          │                  │
          ▼                  ▼
┌─────────────────────────────────────────────────────────┐
│                    LAPTOP A (Backend)                     │
│                  FastAPI + SQLite                         │
│                                                         │
│  ┌──────────────────┐  ┌─────────────────────────────┐  │
│  │ /api/analyze/     │  │ /ws/analyze/live            │  │
│  │ forensic          │  │                             │  │
│  │                   │  │ 6-Second Sliding Window     │  │
│  │ • API Key Auth    │  │ • WAV Header Stripping      │  │
│  │ • Rate Limiting   │  │ • Direct Memory Inference   │  │
│  │ • 100MB Limit     │  │ • Live JSON Streaming       │  │
│  └────────┬──────────┘  └──────────┬──────────────────┘  │
│           │                        │                     │
│           ▼                        ▼                     │
│  ┌─────────────────────────────────────────────────┐     │
│  │              Policy Engine (policy.py)           │     │
│  │  HIGH_RISK → REQUIRE_MFA                        │     │
│  │  SUSPICIOUS → FLAG_FOR_REVIEW                   │     │
│  │  SAFE → ALLOW                                   │     │
│  └─────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────┐
│                    LAPTOP C (ML Engine)                   │
│             PyTorch + HuggingFace Transformers            │
│                                                         │
│  ┌──────────────────┐  ┌─────────────────────────────┐  │
│  │ inference.py      │  │ spectrogram.py              │  │
│  │ Wav2Vec2 Model    │  │ XAI Heatmap Generator       │  │
│  │ Accepts np.ndarray│  │                             │  │
│  └──────────────────┘  └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## 📄 License

This project is built for SIH 2026 (Smart India Hackathon). All rights reserved.
