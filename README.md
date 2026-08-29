# Synthetic Voice Detection

This project aims to detect synthetic or AI-generated voices (deepfakes) from real human voices.

## Project Structure

- `data/`: Contains raw and processed audio datasets.
  - `data/raw/`: Original audio files.
  - `data/processed/`: Extracted features (e.g., MFCCs, Mel-spectrograms).
- `notebooks/`: Jupyter notebooks for exploratory data analysis (EDA) and model prototyping.
- `src/`: Source code for the project.
  - `src/feature_extraction.py`: Scripts for audio processing.
  - `src/train.py`: Model training scripts.
  - `src/evaluate.py`: Model evaluation scripts.
- `models/`: Saved model weights and architectures.

## Getting Started

1. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
