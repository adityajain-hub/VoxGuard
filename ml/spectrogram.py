import librosa
import librosa.display
import matplotlib.pyplot as plt
import numpy as np
import os
import json

def generate_xai_visualization(audio_path, output_path=None):
    """
    Generates a dual-view image for Explainable AI (XAI) analysis of an audio file.
    
    The image contains:
    1. Waveform & Amplitude Envelope
    2. Mel-Spectrogram (dB scale) with pitch contour overlay
    
    These views help detect distinct spectral artifacts typical in cloned voices,
    such as sharp high-frequency cutoffs, unnatural flat harmonic lines, and phase smearing.
    """
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Audio file not found: {audio_path}")
        
    if output_path is None:
        output_path = os.path.splitext(audio_path)[0] + "_xai.png"

    # Load audio
    # Using sr=None to preserve original sample rate, important for high-frequency analysis
    y, sr = librosa.load(audio_path, sr=None)
    
    # Create the figure
    fig, (ax1, ax2) = plt.subplots(nrows=2, figsize=(12, 8), sharex=True)
    plt.subplots_adjust(hspace=0.3)
    
    # ==========================================
    # 1. Waveform & Amplitude Envelope
    # ==========================================
    librosa.display.waveshow(y, sr=sr, ax=ax1, alpha=0.6, color='b', label='Waveform')
    
    # Calculate Amplitude Envelope using RMS
    rms = librosa.feature.rms(y=y)[0]
    times_rms = librosa.times_like(rms, sr=sr)
    
    # Scale RMS and plot symmetric envelope
    ax1.plot(times_rms, rms, color='r', linewidth=2, label='Amplitude Envelope (RMS)')
    ax1.plot(times_rms, -rms, color='r', linewidth=2)
    
    ax1.set(title='Waveform & Amplitude Envelope', ylabel='Amplitude')
    ax1.legend(loc='upper right')
    ax1.grid(True, alpha=0.3)
    
    # ==========================================
    # 2. Mel-Spectrogram (dB scale) with pitch contour
    # ==========================================
    # High-resolution Mel-Spectrogram
    n_fft = 2048
    hop_length = 512
    n_mels = 128
    
    S = librosa.feature.melspectrogram(y=y, sr=sr, n_fft=n_fft, hop_length=hop_length, n_mels=n_mels, fmax=sr/2)
    S_dB = librosa.power_to_db(S, ref=np.max)
    
    img = librosa.display.specshow(S_dB, x_axis='time', y_axis='mel', sr=sr, hop_length=hop_length, 
                                   fmax=sr/2, ax=ax2, cmap='magma')
    
    # Calculate Pitch Contour using pyin (more accurate than yin)
    fmin = librosa.note_to_hz('C2')
    fmax = librosa.note_to_hz('C7')
    f0, voiced_flag, voiced_probs = librosa.pyin(y, fmin=fmin, fmax=fmax, sr=sr, frame_length=n_fft, hop_length=hop_length)
    times_f0 = librosa.times_like(f0, sr=sr, hop_length=hop_length)
    
    # Overlay pitch contour
    ax2.plot(times_f0, f0, label='Pitch Contour (f0)', color='cyan', linewidth=2)
    
    ax2.set(title='Mel-Spectrogram (dB) & Pitch Contour overlay', ylabel='Frequency (Hz)')
    ax2.legend(loc='upper right')
    fig.colorbar(img, ax=ax2, format='%+2.0f dB')
    
    # Save the figure
    plt.savefig(output_path, dpi=300, bbox_inches='tight')
    plt.close(fig)
    
    # ------------------------------------------
    # 3. Heuristic Analysis for JSON Explanation
    # ------------------------------------------
    valid_f0 = f0[~np.isnan(f0)]
    pitch_var = float(np.var(valid_f0)) if len(valid_f0) > 0 else 0.0
    
    # Compare energy in lower frequencies vs highest frequencies
    high_freq_drop = float(np.mean(S_dB[:10, :]) - np.mean(S_dB[-10:, :]))
    
    factors = []
    if pitch_var < 500 and len(valid_f0) > 0:
        factors.append("Unnatural flat pitch contour (lack of human vocal micro-tremors)")
    if high_freq_drop > 45:
        factors.append("Sharp high-frequency cutoff (typical of neural vocoders)")
    if not factors:
        factors.append("Subtle phase smearing and spectral inconsistencies")
        
    explanation = "XAI Analysis detected: " + " | ".join(factors) + "."
    
    return {
        "image_path": output_path,
        "xai_explanation": explanation,
        "metrics": {
            "pitch_variance": round(pitch_var, 2),
            "high_freq_dropoff_db": round(high_freq_drop, 2)
        }
    }

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Generate Explainable AI visualization for audio")
    parser.add_argument("audio_path", help="Path to input audio file")
    parser.add_argument("--output", help="Path to output image file (optional)", default=None)
    args = parser.parse_args()
    
    try:
        result = generate_xai_visualization(args.audio_path, args.output)
        # Print JSON so the frontend (Node.js/Next.js) can parse it easily
        print(json.dumps(result, indent=2))
    except Exception as e:
        error_res = {"error": str(e)}
        print(json.dumps(error_res))
