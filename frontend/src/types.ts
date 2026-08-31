export interface AnalysisResult {
  id: string;
  fileName: string;
  timestamp: string; // ISO String for easier localStorage handling
  isSynthetic: boolean;
  confidence: number;
  spectrogramUrl?: string;
  metrics: {
    speakerMatchScore: number;
    metadataRiskFlag: boolean;
    overallRiskScore: number;
    label: string;
    recommendedAction: string;
  };
}

export type AnalysisStep = 'idle' | 'extracting' | 'analyzing' | 'finalizing' | 'complete';
