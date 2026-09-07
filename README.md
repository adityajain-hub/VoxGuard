<p align="center">
  <h1 align="center">🛡️ VoxGuard</h1>
  <p align="center"><b>AI-Powered Real-Time Voice Cloning Detection & Prevention System</b></p>
  <p align="center">Smart India Hackathon 2026 — Problem Statement: Real-Time Detection and Prevention of Voice Cloning Impersonation Attacks</p>
</p>

---

## 📌 Problem Statement

Voice cloning technology has advanced to the point where AI-generated speech is nearly indistinguishable from real human voices. Fraudsters exploit this to impersonate bank customers, government officials, and corporate executives over phone calls — authorizing wire transfers, bypassing KYC, and committing identity fraud. Existing telecom systems have **zero defences** against this attack vector.

**VoxGuard** is an end-to-end AI security framework that intercepts incoming voice streams in **real-time**, determines the probability that the caller is using a **cloned or AI-generated voice**, and provides instant alerts and recommended actions **before** sensitive transactions are authorized.

---

## 🚀 Key Features

### 🧠 Dual-Mode AI Detection Engine

| Mode | Endpoint | Model | Latency | Use Case |
|------|----------|-------|---------|----------|
| **Forensic Analysis** | `POST /api/analyze/forensic` | Wav2Vec2 (Heavy, 1.2GB) | 5–10s | Full file upload with XAI spectrogram heatmaps |
| **Live Intercept** | `WS /ws/analyze/live` | Wav2Vec2 (Streaming) | < 500ms | Real-time microphone interception during live calls |

### 🎙️ Real-Time WebSocket Streaming Architecture
- **6-Second Sliding Window** — The frontend sends 2-second `.wav` PCM chunks; the backend maintains a rolling 6-second buffer (96,000 samples @ 16kHz) for maximum model accuracy with constant processing speed.
- **Voice Activity Detection (VAD)** — Computes Root-Mean-Square (RMS) energy on each buffer. Silence and ambient room noise (RMS < 0.010, approximately −40 dBFS) are instantly bypassed without wasting GPU/CPU cycles on the neural network. Returns `AWAITING_SPEECH` status to the UI.
- **Warm-Up Phase** — The first 3 seconds of audio are buffered without inference (`BUFFERING` status) to ensure the model has sufficient acoustic context before making predictions.
- **Direct Memory Inference** — NumPy arrays are passed straight to the AI model in RAM with zero disk I/O.
- **Browser Audio Artifact Mitigation** — `getUserMedia` is configured with `echoCancellation: false`, `noiseSuppression: false`, `autoGainControl: false` to prevent browser WebRTC DSP filters from introducing phase artifacts that the model would misclassify as synthetic speech.

### 📊 Explainable AI (XAI) Spectrogram Heatmaps
- **Dual-Panel Visualization** generated at 300 DPI:
  - **Panel 1**: Raw waveform with symmetric RMS amplitude envelope overlay.
  - **Panel 2**: High-resolution 128-bin Mel-Spectrogram (dB scale, `magma` colormap) with PYIN pitch contour (f₀) overlay in cyan.
- **Automated Artifact Detection**:
  - **Flat Pitch Contour** — Flags pitch variance < 500 Hz² as "Unnatural flat pitch (lack of human vocal micro-tremors)", characteristic of TTS/vocoder models.
  - **High-Frequency Cutoff** — Flags spectral dropoff > 45 dB between low and high mel bins as "Sharp high-frequency cutoff (typical of neural vocoders like HiFi-GAN/WaveGlow)".

### 🛡️ Multi-Factor Risk Scoring Engine

The overall risk score fuses deepfake classification probability (80% weight) with speaker biometric mismatch (20% weight) into a bounded 0–100 index:

```
Overall Risk = round(0.80 × P_deepfake + 0.20 × (1.0 - S_speaker)) × 100
```

| Risk Score | Label | Recommended Action |
|------------|-------|--------------------|
| >= 75 | `HIGH_RISK_IMPERSONATION` | `REQUIRE_MFA` — Block transaction, require multi-factor authentication |
| 45–74 | `SUSPICIOUS_VOICE` | `FLAG_FOR_REVIEW` — Alert human agent for manual verification |
| < 45 | `AUTHENTIC_CALLER` | `ALLOW` — Proceed normally |

### 🔐 Enterprise-Grade Security
- **API Key Authentication** — All HTTP endpoints require `X-API-Key: SIH-VOX-2026`.
- **Rate Limiting** — 10 requests/minute per IP via SlowAPI to prevent DDoS/abuse.
- **100MB Upload Limit** — Validated server-side with `413 Payload Too Large` rejection.
- **9 Audio Formats** — `.wav`, `.mp3`, `.flac`, `.ogg`, `.m4a`, `.aac`, `.opus`, `.amr`, `.wma`.
- **Graceful Degradation** — If the AI model crashes on corrupted audio, the server stays alive and returns `ANALYSIS_FAILED` with `MANUAL_REVIEW` instead of a 500 error.

### 📜 Persistent Audit Trail
- All forensic scans are logged to a local **SQLite** database with filename, deepfake probability, speaker match score, action taken, and ISO 8601 timestamp.
- `GET /api/history` returns the 20 most recent scan records for dashboard display and compliance auditing.

### 📡 Telecom Robustness Testing
- **G.711 PSTN Simulator** (`telecom_noise.py`) — Applies 5th-order Butterworth bandpass (300–3400 Hz), mono collapse, and Gaussian cellular static injection to test model resilience against real-world telephony degradation.

---

## 🏗️ System Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                     FRONTEND (React 19 + Vite 8)                      │
│                  TypeScript • Tailwind CSS v4 • WaveSurfer.js         │
│                                                                       │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────────┐  │
│  │  Upload Audio    │  │  Record Mic      │  │  Live Intercept      │  │
│  │  (File Select)   │  │  (Forensic WAV)  │  │  (WebSocket Stream)  │  │
│  └────────┬────────┘  └────────┬────────┘  └──────────┬───────────┘  │
│           │                    │                       │              │
│           │ POST /forensic     │ POST /forensic        │ WS /live     │
│           │ multipart/form     │ (recorded .wav)       │ binary .wav  │
│           │                    │                       │ every 2s     │
│  ┌────────┴────────────────────┴───────────────────────┴───────────┐  │
│  │            AudioWorklet (Off-Thread, 16kHz, Mono PCM)           │  │
│  │        encodeWAV() → 16-bit PCM RIFF WAVE Binary Blobs         │  │
│  └─────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────┬──────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     BACKEND (FastAPI + Uvicorn)                        │
│               Python 3.10+ • SQLAlchemy • SlowAPI                     │
│                                                                       │
│  ┌──────────────────────┐    ┌────────────────────────────────────┐   │
│  │ POST /api/analyze/    │    │ WS /ws/analyze/live                │   │
│  │ forensic              │    │                                    │   │
│  │                       │    │ ┌──────────────────────────────┐   │   │
│  │ • API Key Auth        │    │ │  6-Second Sliding Window     │   │   │
│  │ • Rate Limit 10/min   │    │ │  (96,000 samples @ 16kHz)   │   │   │
│  │ • 100MB File Limit    │    │ ├──────────────────────────────┤   │   │
│  │ • XAI Spectrogram     │    │ │  VAD Silence Gate (RMS)     │   │   │
│  │ • SQLite Audit Log    │    │ │  Buffer Warm-Up (>=3s)      │   │   │
│  │ • Graceful Degradation│    │ │  Direct Memory Inference    │   │   │
│  └──────────┬───────────┘    │ │  Live JSON Risk Streaming   │   │   │
│             │                 │ └──────────────────────────────┘   │   │
│             │                 └──────────────┬────────────────────┘   │
│             │                                │                        │
│             ▼                                ▼                        │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │                    Policy Engine (policy.py)                    │   │
│  │   HIGH_RISK (>75) → REQUIRE_MFA                                │   │
│  │   SUSPICIOUS (45-74) → FLAG_FOR_REVIEW                         │   │
│  │   AUTHENTIC (<45) → ALLOW                                      │   │
│  └────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────┬──────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     ML ENGINE (PyTorch + HuggingFace)                  │
│               Wav2Vec2 • LibROSA • SoundFile • SciPy                  │
│                                                                       │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌────────────┐  │
│  │ inference.py          │  │ spectrogram.py        │  │ telecom_   │  │
│  │                       │  │                       │  │ noise.py   │  │
│  │ • Wav2Vec2 Classifier │  │ • Mel-Spectrogram     │  │            │  │
│  │ • Speaker Embeddings  │  │ • RMS Envelope        │  │ • G.711    │  │
│  │ • Cosine Verification │  │ • PYIN Pitch Contour  │  │   Bandpass │  │
│  │ • Auto Label Mapping  │  │ • Artifact Detection  │  │ • Cellular │  │
│  │ • Multi-Format Input  │  │ • 300 DPI Export      │  │   Static   │  │
│  └──────────────────────┘  └──────────────────────┘  └────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
VoxGuard/
├── README.md                    # This file
├── API_CONTRACT.md              # Complete API specification (v2.0)
├── TASKS.md                     # Team task tracker & code snippets
├── .gitignore                   # Ignores data/, venv/, node_modules/, *.db
│
├── backend/                     # FastAPI Application Server
│   ├── main.py                  # REST API + WebSocket + Auth + Rate Limiting + VAD
│   ├── database.py              # SQLAlchemy ORM + SQLite scan history
│   ├── policy.py                # Risk scoring & action recommendation engine
│   └── requirements.txt         # Backend Python dependencies
│
├── frontend/                    # React 19 Single Page Application
│   ├── package.json             # Dependencies (React, Vite, Tailwind, WaveSurfer)
│   ├── public/
│   │   └── audio-processor.js   # AudioWorklet processor (off-thread PCM capture)
│   └── src/
│       ├── App.tsx              # Router (/ → Dashboard, /history → History)
│       ├── main.tsx             # React root mount
│       ├── types.ts             # TypeScript models (AnalysisResult, AnalysisStep)
│       ├── pages/
│       │   ├── Home.tsx         # Main dashboard (Upload, Record, Live Intercept)
│       │   └── History.tsx      # Scan history & audit log viewer
│       └── components/
│           └── WaveformPlayer.tsx  # WaveSurfer.js audio waveform renderer
│
├── ml/                          # Machine Learning Pipeline
│   ├── inference.py             # DeepfakeVoiceDetector class (Wav2Vec2 + Speaker Verification)
│   ├── spectrogram.py           # XAI heatmap generator (Mel-Spectrogram + Pitch Contour)
│   ├── telecom_noise.py         # PSTN/cellular channel degradation simulator
│   └── requirements.txt         # ML dependencies (PyTorch, Transformers, LibROSA)
│
└── data/                        # Runtime data (not committed to Git)
    ├── uploads/                 # Temporary incoming audio files
    ├── spectrograms/            # Generated XAI heatmap PNG images
    └── database.db              # SQLite audit database
```

---

## ⚙️ Setup & Installation

### Prerequisites
| Tool | Version | Purpose |
|------|---------|---------|
| Python | 3.10+ | Backend & ML engine |
| Node.js | 18+ | Frontend build toolchain |
| Git | Latest | Version control |

### Step 1: Clone the Repository
```bash
git clone https://github.com/adityajain-hub/VoxGuard.git
cd VoxGuard
```

### Step 2: Backend Setup
```bash
cd backend
python -m venv venv

# Windows
.\venv\Scripts\Activate.ps1

# macOS / Linux
source venv/bin/activate

# Install all dependencies (backend + ML)
pip install -r requirements.txt
pip install -r ../ml/requirements.txt
```

### Step 3: Pre-Download AI Models (Recommended)
The Wav2Vec2 model (~1.2 GB) is downloaded from HuggingFace on first run. To avoid startup delays, pre-cache it:
```bash
python ../download_models.py
```
This shows a live progress bar in your terminal.

### Step 4: Start the Backend Server
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```
- API available at: `http://localhost:8000`
- Swagger UI docs at: `http://localhost:8000/docs`

### Step 5: Frontend Setup (New Terminal)
```bash
cd frontend
npm install
npm run dev
```
- Dashboard available at: `http://localhost:5173`

---

## 🖥️ Usage Guide

### 1. Upload Audio File
1. Click **"Upload Audio"** on the dashboard.
2. Select any audio file (WAV, MP3, FLAC, OGG, M4A, AAC, OPUS, AMR, WMA).
3. Preview the waveform using the interactive player.
4. Click **"Analyze Audio"** — The file is sent to the forensic API for deep analysis.
5. View the XAI Mel-Spectrogram heatmap, deepfake probability, speaker match score, risk score, and recommended action.

### 2. Record Microphone (Forensic Mode)
1. Click **"Record Mic"** — The microphone starts capturing at 16 kHz mono.
2. Speak into your microphone.
3. Click again to **stop recording** — A `.wav` file is generated in-browser.
4. Click **"Analyze Audio"** to run the full forensic pipeline on the recording.

### 3. Live Intercept (Real-Time Mode)
1. Click **"Live Intercept"** — Opens a WebSocket connection and starts streaming.
2. Every 2 seconds, a raw audio chunk is sent to the backend over WebSocket.
3. The backend runs the AI model on a rolling 6-second window and streams back live risk scores.
4. The dashboard updates in real-time with the current deepfake probability, label, and action.
5. Click again to **stop interception**.

---

## 🔌 API Reference

| Method | Endpoint | Auth | Rate Limit | Description |
|--------|----------|------|------------|-------------|
| `POST` | `/api/analyze/forensic` | `X-API-Key: SIH-VOX-2026` | 10/min | Full forensic analysis + XAI spectrogram |
| `WS` | `/ws/analyze/live` | None | None | Real-time streaming with 6s sliding window |
| `GET` | `/api/history` | `X-API-Key: SIH-VOX-2026` | 10/min | Last 20 scan results from SQLite |

> See [`API_CONTRACT.md`](API_CONTRACT.md) for complete request/response schemas, error codes, and integration code snippets.

---

## 🧪 Technical Deep Dive

### ML Model: Wav2Vec2 for Deepfake Detection
- **Architecture**: Facebook's Wav2Vec 2.0 base model, fine-tuned on synthetic/spoofed vs authentic speech datasets.
- **Primary Model**: [`garystafford/wav2vec2-deepfake-voice-detector`](https://huggingface.co/garystafford/wav2vec2-deepfake-voice-detector) — High sensitivity to spectral and phase artifacts introduced by speech synthesizers and vocoders.
- **Fallback Model**: [`MelodyMachine/Deepfake-audio-detection-V2`](https://huggingface.co/MelodyMachine/Deepfake-audio-detection-V2) — Automatic failover if the primary model is unavailable.
- **Auto Label Resolution**: The system dynamically inspects each model's `id2label` config to correctly map `fake`/`real` class indices, supporting arbitrary classification heads without hardcoded assumptions.

### Speaker Verification Pipeline
- Extracts L2-normalized acoustic embeddings from the final transformer hidden layer using temporal mean pooling.
- Computes **cosine similarity** between the test voice and an enrolled reference voiceprint.
- Maps similarity from [-1, 1] to [0, 1] for intuitive scoring.

### Audio Processing Pipeline
- **Input Formats**: File paths, byte streams, PyTorch tensors, and NumPy arrays.
- **Channel Handling**: Automatic stereo-to-mono downmixing with intelligent axis detection.
- **Resampling**: Cascading strategy — LibROSA → torchaudio → linear interpolation fallback.
- **Normalization**: Peak normalization to [-1.0, 1.0] range.

### Frontend Audio Pipeline
- **AudioWorklet** runs in a dedicated rendering thread, collecting 4096-sample Float32 blocks without blocking the UI.
- Samples are accumulated until 32,000 (2 seconds @ 16 kHz), then encoded into a 16-bit PCM RIFF WAVE blob using a custom `encodeWAV()` function.
- Binary WAV blobs are sent over the WebSocket for immediate server-side inference.

---

## 🛠️ Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| **Frontend** | React | 19.2.8 |
| | TypeScript | 6.0.2 |
| | Vite | 8.2.2 |
| | Tailwind CSS | 4.3.3 |
| | WaveSurfer.js | 7.12.11 |
| | Lucide React | 1.37.0 |
| **Backend** | FastAPI | 0.141.1 |
| | Uvicorn | 0.52.4 |
| | SQLAlchemy | 2.0.52 |
| | SlowAPI | 0.1.10 |
| | WebSockets | 17.1 |
| **ML Engine** | PyTorch | Latest (CPU) |
| | HuggingFace Transformers | Latest |
| | LibROSA | Latest |
| | SoundFile | Latest |
| | SciPy | Latest |
| | Matplotlib | Latest |

---

## 👥 Team

| Role | Responsibilities |
|------|-----------------|
| **Backend Developer** | FastAPI server, REST API, WebSocket streaming, authentication, rate limiting, database, policy engine, VAD, and integration |
| **Frontend Developer** | React dashboard, AudioWorklet pipeline, WAV encoding, WaveSurfer visualization, WebSocket client, and UI/UX |
| **ML Engineer** | Wav2Vec2 inference engine, speaker verification, XAI spectrogram generator, telecom noise simulator, and audio preprocessing |

---

## 📄 License

This project was built for **Smart India Hackathon 2026**. All rights reserved.
