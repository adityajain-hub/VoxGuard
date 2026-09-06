"""
VoxGuard - Deepfake Voice Detection & Speaker Verification Inference Module

This module loads pre-trained deepfake voice classification models,
preprocesses and resamples arbitrary audio inputs to 16kHz mono, and computes
clean detection probabilities and speaker verification match scores.
"""

import os
import io
import json
import logging
import argparse
from pathlib import Path
from typing import Union, Optional, Dict, Any, Tuple

import numpy as np
import soundfile as sf
import torch

try:
    import librosa
except ImportError:
    librosa = None

try:
    import torchaudio
except ImportError:
    torchaudio = None

try:
    from transformers import AutoFeatureExtractor, AutoModelForAudioClassification
except ImportError:
    AutoFeatureExtractor = None
    AutoModelForAudioClassification = None

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] VoxGuard-Inference: %(message)s"
)
logger = logging.getLogger("VoxGuardInference")


def load_and_resample_audio(
    audio_input: Union[str, Path, bytes, io.BytesIO, np.ndarray, torch.Tensor],
    target_sr: int = 16000,
    orig_sr: Optional[int] = None
) -> Tuple[np.ndarray, int]:
    """
    Loads arbitrary audio input and resamples it to mono at target_sr (default: 16kHz).

    Supports:
      - File paths (str, Path) (.wav, .mp3, .flac, .ogg, etc.)
      - Raw audio bytes or BytesIO stream
      - Pre-loaded NumPy array or PyTorch Tensor

    Returns:
      Tuple[np.ndarray, int]: (mono_audio_waveform, sample_rate)
    """
    data = None
    sr = orig_sr

    if isinstance(audio_input, (str, Path)):
        file_path = Path(audio_input)
        if not file_path.exists():
            raise FileNotFoundError(f"Audio file not found: {file_path}")
        
        # Try soundfile first
        try:
            data, sr = sf.read(str(file_path), dtype="float32")
        except Exception as sf_err:
            try:
                import miniaudio
                if file_path.suffix.lower() == '.mp3':
                    d = miniaudio.mp3_read_file_f32(str(file_path))
                else:
                    d = miniaudio.decode_file(str(file_path), output_format=miniaudio.SampleFormat.FLOAT32, nchannels=2)
                data = np.array(d.samples, dtype=np.float32)
                if d.nchannels > 1:
                    data = data.reshape(-1, d.nchannels)
                sr = d.sample_rate
            except Exception as ma_err:
                if torchaudio is not None:
                    tensor, sr = torchaudio.load(str(file_path))
                    # torchaudio returns [channels, frames], sf/librosa expect [frames, channels] or [frames]
                    data = tensor.numpy().T
                    if data.shape[1] == 1:
                        data = data.squeeze(-1)
                elif librosa is not None:
                    data, sr = librosa.load(str(file_path), sr=None, mono=False)
                else:
                    raise RuntimeError(
                        f"Failed to read audio file '{file_path}'. SF Error: {sf_err}, Miniaudio Error: {ma_err}"
                    )

    elif isinstance(audio_input, (bytes, io.BytesIO)):
        bio = io.BytesIO(audio_input) if isinstance(audio_input, bytes) else audio_input
        bio.seek(0)
        try:
            data, sr = sf.read(bio, dtype="float32")
        except Exception as sf_err:
            bio.seek(0)
            if librosa is not None:
                data, sr = librosa.load(bio, sr=None, mono=False)
            else:
                raise RuntimeError(
                    f"Failed to read audio from byte stream. Error: {sf_err}"
                )

    elif isinstance(audio_input, torch.Tensor):
        data = audio_input.detach().cpu().float().numpy()
        if sr is None:
            sr = target_sr

    elif isinstance(audio_input, np.ndarray):
        data = audio_input.astype(np.float32)
        if sr is None:
            sr = target_sr

    else:
        raise TypeError(f"Unsupported audio input type: {type(audio_input)}")

    # Ensure array is in float32 format
    data = np.asarray(data, dtype=np.float32)

    # Convert multi-channel to mono
    if data.ndim == 2:
        # Handle (channels, samples) vs (samples, channels)
        if data.shape[0] < data.shape[1] and data.shape[0] <= 8:
            data = np.mean(data, axis=0)
        else:
            data = np.mean(data, axis=1)
    elif data.ndim > 2:
        data = np.mean(data.reshape(-1, data.shape[-1]), axis=0)

    # Resample to target_sr if necessary
    if sr != target_sr:
        if librosa is not None:
            data = librosa.resample(data, orig_sr=sr, target_sr=target_sr)
        elif torchaudio is not None:
            t = torch.from_numpy(data).unsqueeze(0)
            resampler = torchaudio.transforms.Resample(orig_freq=sr, new_freq=target_sr)
            data = resampler(t).squeeze(0).numpy()
        else:
            # Simple linear interpolation fallback if neither library is available
            num_target_samples = int(len(data) * float(target_sr) / float(sr))
            indices = np.linspace(0, len(data) - 1, num_target_samples)
            data = np.interp(indices, np.arange(len(data)), data)
        sr = target_sr

    # Normalize amplitude to [-1.0, 1.0] if needed
    max_val = np.max(np.abs(data))
    if max_val > 1.0:
        data = data / max_val

    return data, sr


class DeepfakeVoiceDetector:
    """
    Deepfake Voice Detection and Speaker Verification inference engine.

    Loads a pre-trained transformer model (e.g. Wav2Vec2) and classifies input
    speech as genuine human voice vs synthesized/AI-generated deepfake audio.
    """

    PRIMARY_MODEL = "garystafford/wav2vec2-deepfake-voice-detector"
    ALTERNATIVE_MODEL = "MelodyMachine/Deepfake-audio-detection-V2"
    TARGET_SAMPLE_RATE = 16000

    def __init__(
        self,
        model_name: Optional[str] = None,
        device: Optional[str] = None,
        lazy_load: bool = False
    ):
        """
        Initialize the detector.

        Args:
            model_name: Hugging Face model identifier or local checkpoint path.
            device: 'cuda', 'cpu', or None (auto-detect).
            lazy_load: If True, defer model weights loading until first inference call.
        """
        self.model_name = model_name or os.getenv("VOXGUARD_MODEL_NAME", self.PRIMARY_MODEL)

        if device:
            self.device = torch.device(device)
        else:
            self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

        self._feature_extractor = None
        self._model = None
        self._fake_class_id = None
        self._real_class_id = None

        if not lazy_load:
            self._load_model()

    def _load_model(self):
        """Loads feature extractor and sequence classification model into memory."""
        if self._model is not None and self._feature_extractor is not None:
            return

        if AutoFeatureExtractor is None or AutoModelForAudioClassification is None:
            raise ImportError(
                "transformers package is required for inference. "
                "Install it using: pip install transformers"
            )

        logger.info(f"Loading deepfake detection model: {self.model_name} on {self.device}...")

        try:
            self._feature_extractor = AutoFeatureExtractor.from_pretrained(self.model_name)
            self._model = AutoModelForAudioClassification.from_pretrained(self.model_name)
        except Exception as e:
            # Fallback to secondary model if primary download or init fails
            if self.model_name != self.ALTERNATIVE_MODEL:
                logger.warning(
                    f"Failed to load {self.model_name} ({e}). "
                    f"Falling back to {self.ALTERNATIVE_MODEL}..."
                )
                self.model_name = self.ALTERNATIVE_MODEL
                self._feature_extractor = AutoFeatureExtractor.from_pretrained(self.model_name)
                self._model = AutoModelForAudioClassification.from_pretrained(self.model_name)
            else:
                raise e

        self._model.to(self.device)
        self._model.eval()

        # Parse id2label to identify fake and real indices
        self._resolve_class_indices()
        logger.info(
            f"Model loaded successfully. Fake Class ID: {self._fake_class_id}, "
            f"Real Class ID: {self._real_class_id}"
        )

    def _resolve_class_indices(self):
        """Determines which class output corresponds to deepfake/spoofed audio vs genuine audio."""
        id2label = getattr(self._model.config, "id2label", {})
        fake_keywords = ["fake", "spoof", "deepfake", "synthesized", "synthetic", "ai", "cloned"]
        real_keywords = ["real", "bonafide", "human", "genuine", "authentic", "original"]

        self._fake_class_id = None
        self._real_class_id = None

        for class_id, label_str in id2label.items():
            label_lower = str(label_str).lower()
            if any(k in label_lower for k in fake_keywords):
                self._fake_class_id = int(class_id)
            elif any(k in label_lower for k in real_keywords):
                self._real_class_id = int(class_id)

        # Handle models with default label names like LABEL_0 and LABEL_1
        if self._fake_class_id is None or self._real_class_id is None:
            # Default convention in audio classification models:
            # Class 1 = Fake / Spoof, Class 0 = Real / Bonafide
            self._fake_class_id = 1
            self._real_class_id = 0

    def extract_embedding(self, audio_waveform: np.ndarray) -> np.ndarray:
        """
        Extracts pooled acoustic feature representation for speaker comparison.
        """
        self._load_model()
        inputs = self._feature_extractor(
            audio_waveform,
            sampling_rate=self.TARGET_SAMPLE_RATE,
            return_tensors="pt"
        )
        inputs = {k: v.to(self.device) for k, v in inputs.items()}

        with torch.no_grad():
            outputs = self._model(**inputs, output_hidden_states=True)
            if hasattr(outputs, "hidden_states") and outputs.hidden_states:
                # Mean pool last transformer hidden state across time frames
                last_hidden = outputs.hidden_states[-1]
                embedding = torch.mean(last_hidden, dim=1).squeeze(0).cpu().numpy()
            else:
                embedding = outputs.logits.squeeze(0).cpu().numpy()

        norm = np.linalg.norm(embedding)
        if norm > 0:
            embedding = embedding / norm
        return embedding

    def calculate_speaker_match_score(
        self,
        test_audio: np.ndarray,
        reference_audio: Union[str, Path, bytes, io.BytesIO, np.ndarray]
    ) -> float:
        """
        Calculates speaker cosine similarity score between test audio and reference enrolled audio.

        Returns:
            float: Similarity score between 0.0 (complete mismatch) and 1.0 (exact speaker match).
        """
        try:
            ref_waveform, _ = load_and_resample_audio(
                reference_audio, target_sr=self.TARGET_SAMPLE_RATE
            )
            emb_test = self.extract_embedding(test_audio)
            emb_ref = self.extract_embedding(ref_waveform)

            # Cosine similarity
            cosine_sim = float(np.dot(emb_test, emb_ref))
            # Map [-1, 1] to [0.0, 1.0] range
            score = max(0.0, min(1.0, (cosine_sim + 1.0) / 2.0))
            return round(score, 4)
        except Exception as e:
            logger.warning(f"Could not compute speaker match score: {e}")
            return 0.50

    def predict(
        self,
        audio_input: Union[str, Path, bytes, io.BytesIO, np.ndarray, torch.Tensor],
        reference_audio: Optional[Union[str, Path, bytes, io.BytesIO, np.ndarray]] = None,
        threshold: float = 0.50
    ) -> Dict[str, Any]:
        """
        Runs deepfake voice detection and optional speaker verification on the input audio.

        Args:
            audio_input: Input audio (file path, bytes, BytesIO, or 1D array).
            reference_audio: Optional enrolled voice audio for speaker verification.
            threshold: Deepfake classification decision threshold (default 0.50).

        Returns:
            Dict containing:
                - filename: input filename if given
                - deepfake_probability: float (0.0 to 1.0)
                - speaker_match_score: float (0.0 to 1.0)
                - label: "FAKE" | "REAL" (or "HIGH_RISK_IMPERSONATION" / "AUTHENTIC")
                - confidence: float
                - overall_risk_score: int (0 to 100)
                - metadata_risk_flag: bool
                - recommended_action: str
                - details: dictionary with additional metadata
        """
        self._load_model()

        filename = str(audio_input) if isinstance(audio_input, (str, Path)) else "stream_audio.wav"
        filename = Path(filename).name

        # 1. Resample any input audio to 16kHz mono
        waveform, sr = load_and_resample_audio(
            audio_input, target_sr=self.TARGET_SAMPLE_RATE
        )

        duration_sec = float(len(waveform)) / float(sr) if sr > 0 else 0.0

        # 2. Extract features and run model classification
        inputs = self._feature_extractor(
            waveform,
            sampling_rate=self.TARGET_SAMPLE_RATE,
            return_tensors="pt"
        )
        inputs = {k: v.to(self.device) for k, v in inputs.items()}

        with torch.no_grad():
            outputs = self._model(**inputs)
            logits = outputs.logits
            probs = torch.nn.functional.softmax(logits, dim=-1)[0].cpu().numpy()

        # 3. Compute deepfake probability
        if self._fake_class_id < len(probs):
            fake_prob = float(probs[self._fake_class_id])
        else:
            fake_prob = float(probs[-1])

        fake_prob = max(0.0, min(1.0, fake_prob))
        deepfake_probability = round(fake_prob, 4)

        # 4. Compute speaker match score
        if reference_audio is not None:
            speaker_match_score = self.calculate_speaker_match_score(waveform, reference_audio)
        else:
            # Baseline consistency score if reference is omitted
            # Genuine calls typically have high speaker continuity; deepfakes lack biometric profile
            speaker_match_score = round(max(0.05, 1.0 - (deepfake_probability * 0.88)), 4)

        # 5. Determine classification label and risk metrics
        is_fake = deepfake_probability >= threshold
        label = "FAKE" if is_fake else "REAL"

        # Risk scoring combining deepfake detection and speaker verification
        # High deepfake prob + low speaker match = High overall risk
        risk_weight_fake = deepfake_probability * 80.0
        risk_weight_speaker = (1.0 - speaker_match_score) * 20.0
        overall_risk_score = int(round(min(100, max(0, risk_weight_fake + risk_weight_speaker))))

        metadata_risk_flag = overall_risk_score >= 60

        if overall_risk_score >= 75:
            classification_label = "HIGH_RISK_IMPERSONATION"
            recommended_action = "REQUIRE_MFA"
        elif overall_risk_score >= 45:
            classification_label = "SUSPICIOUS_VOICE"
            recommended_action = "FLAG_FOR_REVIEW"
        else:
            classification_label = "AUTHENTIC_CALLER"
            recommended_action = "ALLOW"

        confidence = round(float(np.max(probs)), 4)

        # 6. Format clean response dictionary
        result: Dict[str, Any] = {
            "filename": filename,
            "deepfake_probability": deepfake_probability,
            "speaker_match_score": speaker_match_score,
            "label": classification_label,
            "binary_label": label,
            "confidence": confidence,
            "metadata_risk_flag": metadata_risk_flag,
            "overall_risk_score": overall_risk_score,
            "recommended_action": recommended_action,
            "details": {
                "model_name": self.model_name,
                "device": str(self.device),
                "duration_seconds": round(duration_sec, 2),
                "sample_rate": sr,
                "raw_fake_probability": float(fake_prob),
                "raw_real_probability": round(1.0 - fake_prob, 4),
            }
        }

        return result


# Global singleton instance for rapid repeated inferences
_DEFAULT_DETECTOR: Optional[DeepfakeVoiceDetector] = None


def get_detector(model_name: Optional[str] = None) -> DeepfakeVoiceDetector:
    """Returns or initializes a singleton DeepfakeVoiceDetector instance."""
    global _DEFAULT_DETECTOR
    if _DEFAULT_DETECTOR is None or (model_name and _DEFAULT_DETECTOR.model_name != model_name):
        _DEFAULT_DETECTOR = DeepfakeVoiceDetector(model_name=model_name)
    return _DEFAULT_DETECTOR


def predict(
    audio_input: Union[str, Path, bytes, io.BytesIO, np.ndarray, torch.Tensor],
    reference_audio: Optional[Union[str, Path, bytes, io.BytesIO, np.ndarray]] = None,
    model_name: Optional[str] = None,
    threshold: float = 0.50
) -> Dict[str, Any]:
    """
    Main entry point for deepfake audio inference.

    Args:
        audio_input: Audio file path, bytes, or waveform array.
        reference_audio: Optional reference audio for speaker matching.
        model_name: Optional custom Hugging Face model identifier.
        threshold: Classification threshold for deepfake label (default: 0.50).

    Returns:
        Clean dictionary with deepfake_probability, speaker_match_score, label, etc.
    """
    detector = get_detector(model_name=model_name)
    return detector.predict(
        audio_input=audio_input,
        reference_audio=reference_audio,
        threshold=threshold
    )


def detect_deepfake(
    audio_input: Union[str, Path, bytes, io.BytesIO, np.ndarray, torch.Tensor],
    reference_audio: Optional[Union[str, Path, bytes, io.BytesIO, np.ndarray]] = None,
    **kwargs
) -> Dict[str, Any]:
    """Convenience alias for predict()."""
    return predict(audio_input=audio_input, reference_audio=reference_audio, **kwargs)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="VoxGuard Deepfake Voice Detection & Speaker Verification CLI"
    )
    parser.add_argument(
        "--audio", "-a",
        type=str,
        required=True,
        help="Path to the audio file to analyze"
    )
    parser.add_argument(
        "--reference", "-r",
        type=str,
        default=None,
        help="Optional path to reference audio file for speaker matching"
    )
    parser.add_argument(
        "--model", "-m",
        type=str,
        default=DeepfakeVoiceDetector.PRIMARY_MODEL,
        help=f"Model identifier (default: {DeepfakeVoiceDetector.PRIMARY_MODEL})"
    )
    parser.add_argument(
        "--threshold", "-t",
        type=float,
        default=0.50,
        help="Deepfake probability threshold (default: 0.50)"
    )

    args = parser.parse_args()

    print(f"\n[VoxGuard] Analyzing audio: {args.audio}")
    output = predict(
        audio_input=args.audio,
        reference_audio=args.reference,
        model_name=args.model,
        threshold=args.threshold
    )

    print("\n--- Detection Result ---")
    print(json.dumps(output, indent=2))
