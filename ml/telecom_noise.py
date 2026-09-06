import librosa
import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt
import os
import argparse

def apply_bandpass_filter(data, fs, lowcut=300.0, highcut=3400.0, order=5):
    """
    Applies a Butterworth bandpass filter to simulate telephone frequency limitations.
    Telephones typically only transmit frequencies between 300 Hz and 3400 Hz.
    """
    nyq = 0.5 * fs
    low = lowcut / nyq
    high = highcut / nyq
    
    # Use SOS (second-order sections) for better numerical stability
    sos = butter(order, [low, high], btype='band', output='sos')
    filtered_data = sosfilt(sos, data)
    return filtered_data

def inject_static(data, noise_level=0.005):
    """
    Injects a tiny amount of Gaussian noise to simulate cellular static and packet loss jitter.
    """
    noise = np.random.normal(0, noise_level, data.shape)
    return data + noise

def simulate_telecom_network(audio_path, output_path=None, noise_level=0.005):
    """
    Simulates telecom and cellular network degradation on an audio file.
    
    Performs 3 steps:
    1. Mono Conversion (forced)
    2. Bandpass Filtering (300Hz - 3400Hz)
    3. Static Injection (Gaussian noise)
    """
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Audio file not found: {audio_path}")
        
    if output_path is None:
        base, ext = os.path.splitext(audio_path)
        output_path = f"{base}_telecom{ext}"
        
    # Step 1: Mono Conversion
    # librosa.load with mono=True forces the audio into a single channel
    y, sr = librosa.load(audio_path, sr=None, mono=True)
    
    # Step 2: Bandpass Filtering (300 Hz to 3400 Hz)
    y_filtered = apply_bandpass_filter(y, sr, lowcut=300.0, highcut=3400.0)
    
    # Step 3: Static Injection
    y_noisy = inject_static(y_filtered, noise_level=noise_level)
    
    # Ensure values are within valid audio range [-1.0, 1.0] to prevent clipping distortion on save
    y_noisy = np.clip(y_noisy, -1.0, 1.0)
    
    # Save the processed audio
    sf.write(output_path, y_noisy, sr)
    return output_path

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Telecom & Cellular Network Simulator for Deepfake Audio Testing")
    parser.add_argument("audio_path", help="Path to input audio file")
    parser.add_argument("--output", help="Path to output degraded audio file (optional)", default=None)
    parser.add_argument("--noise", type=float, default=0.005, help="Noise level to inject (default: 0.005)")
    
    args = parser.parse_args()
    
    try:
        out_path = simulate_telecom_network(args.audio_path, args.output, args.noise)
        print(f"Network simulation complete. Degraded audio saved to: {out_path}")
    except Exception as e:
        print(f"Error simulating network: {e}")
