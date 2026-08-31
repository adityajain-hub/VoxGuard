# VoxGuard Frontend - Synthetic Voice Detector

This is the React frontend for the VoxGuard Synthetic Voice Detection system, built with Vite, TypeScript, and Tailwind CSS.

## Features

The frontend interface provides three distinct modes for analyzing audio for deepfakes and AI-generated voices:

1. **Upload Audio**: Upload existing audio files (`.wav`, `.mp3`, `.flac`, etc.) directly to the forensic backend for deep ML analysis and Explainable AI (XAI) spectrogram generation.
2. **Record Mic (Forensic Analysis)**: Records a high-quality microphone clip directly in your browser. When you stop recording, it automatically packages it into a `.wav` file and sends it to the forensic backend. The results are permanently saved in your history along with a visual spectrogram.
3. **Live Intercept (Real-Time Monitor)**: Acts as a real-time threat monitor for active phone calls or voice chats. It uses an in-browser `AudioWorklet` to stream your raw microphone audio to a backend WebSocket (`/ws/analyze/live`). Every 2 seconds, the dashboard flashes instant updates on the speaker's "Deepfake Probability" and "Risk Score" without cluttering the database.

## Architecture & Tech Stack

- **Framework**: React 18
- **Build Tool**: Vite
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Audio Processing**: Web Audio API (`AudioContext`, `AudioWorklet`) for precise raw PCM capture and custom WAV encoding directly in the browser.
- **Icons**: Lucide React

## Setup & Running

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

> **Note**: The frontend expects the FastAPI backend to be running on `http://localhost:8000`. Ensure you have started the backend and installed its requirements (including `slowapi` and `websockets`) before analyzing audio.

## Audio Processing Implementation

To bypass the limitations of standard browser `MediaRecorder` (which natively outputs lossy `.webm` chunks that crash `soundfile`), this frontend uses a custom `public/audio-processor.js` Worklet. 
This captures raw `Float32Array` PCM audio frames, allowing the frontend to dynamically encode perfect binary `.wav` files in memory before transmitting them to the backend's API and WebSocket endpoints.
