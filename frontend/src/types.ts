export interface AnalysisResult {
  id: string;
  fileName: string;
  timestamp: Date;
  isSynthetic: boolean;
  confidence: number;
  metrics: {
    spectrogram: number;
    pitchConsistency: number;
    noiseArtifacts: number;
  };
}

export type AnalysisStep = 'idle' | 'extracting' | 'analyzing' | 'finalizing' | 'complete';
