import { useState, useRef } from 'react';
import { UploadCloud, Mic, Activity, CheckCircle, AlertTriangle, Clock, ChevronRight } from 'lucide-react';
import WaveformPlayer from './components/WaveformPlayer';
import type { AnalysisResult, AnalysisStep } from './types';

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  
  const [step, setStep] = useState<AnalysisStep>('idle');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  
  const [history, setHistory] = useState<AnalysisResult[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      setAudioUrl(URL.createObjectURL(selected));
      setStep('idle');
      setResult(null);
    }
  };

  // Recording logic using MediaRecorder API
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        // Create a File object from the blob
        const recordedFile = new File([audioBlob], `Recording_${new Date().toISOString().slice(11, 19).replace(/:/g, '-')}.webm`, { type: 'audio/webm' });
        
        setFile(recordedFile);
        setAudioUrl(URL.createObjectURL(recordedFile));
        setStep('idle');
        setResult(null);
        
        // Stop all tracks to release mic
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Could not access microphone. Please check your browser permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // Mock Analysis Process
  const handleAnalyze = () => {
    if (!file) return;
    
    setStep('extracting');
    
    setTimeout(() => {
      setStep('analyzing');
      
      setTimeout(() => {
        setStep('finalizing');
        
        setTimeout(() => {
          const isSynthetic = Math.random() > 0.5; // Mock logic
          const newResult: AnalysisResult = {
            id: Math.random().toString(36).substring(7),
            fileName: file.name,
            timestamp: new Date(),
            isSynthetic,
            confidence: isSynthetic ? 0.85 + Math.random() * 0.14 : 0.88 + Math.random() * 0.11,
            metrics: {
              spectrogram: isSynthetic ? 0.92 : 0.12,
              pitchConsistency: isSynthetic ? 0.88 : 0.23,
              noiseArtifacts: isSynthetic ? 0.79 : 0.15,
            }
          };
          
          setResult(newResult);
          setStep('complete');
          setHistory(prev => [newResult, ...prev].slice(0, 5)); // Keep last 5
        }, 1200);
      }, 1500);
    }, 1000);
  };

  // Render progress step
  const renderProgress = () => {
    if (step === 'idle' || step === 'complete') return null;
    
    const steps = [
      { id: 'extracting', label: 'Extracting features...' },
      { id: 'analyzing', label: 'Running through model...' },
      { id: 'finalizing', label: 'Finalizing score...' }
    ];
    
    const currentIndex = steps.findIndex(s => s.id === step);
    
    return (
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 mt-6">
        <div className="flex items-center justify-between">
          {steps.map((s, idx) => (
            <div key={s.id} className="flex flex-col items-center flex-1">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 transition-colors ${
                idx < currentIndex ? 'bg-green-500 text-white' : 
                idx === currentIndex ? 'bg-blue-600 text-white animate-pulse' : 
                'bg-gray-100 text-gray-400'
              }`}>
                {idx < currentIndex ? <CheckCircle size={20} /> : <Activity size={20} />}
              </div>
              <span className={`text-sm font-medium ${idx <= currentIndex ? 'text-gray-900' : 'text-gray-400'}`}>
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans p-6 md:p-12">
      <header className="max-w-6xl mx-auto mb-10">
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 flex items-center gap-3">
          <Activity className="text-blue-600" size={32} />
          Synthetic Voice <span className="text-blue-600">Detector</span>
        </h1>
        <p className="text-gray-600 mt-2">Upload or record audio to detect deepfakes and AI-generated voices.</p>
      </header>

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Main Column */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Upload & Record Section */}
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200">
            <div className="grid grid-cols-2 gap-4 mb-6">
              {/* File Upload Button */}
              <button 
                onClick={() => !isRecording && fileInputRef.current?.click()}
                disabled={isRecording}
                className={`flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl transition-all group ${
                  isRecording 
                    ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed' 
                    : 'border-gray-300 hover:bg-gray-50 hover:border-blue-400'
                }`}
              >
                <UploadCloud size={40} className={`mb-3 ${isRecording ? 'text-gray-300' : 'text-gray-400 group-hover:text-blue-500'}`} />
                <span className="font-semibold text-gray-700">Upload Audio</span>
                <span className="text-xs text-gray-500 mt-1">WAV, MP3, FLAC</span>
              </button>
              
              {/* Record Mic Button */}
              <button 
                onClick={isRecording ? stopRecording : startRecording}
                className={`flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl transition-all group ${
                  isRecording 
                    ? 'border-red-500 bg-red-50 hover:bg-red-100' 
                    : 'border-gray-300 hover:bg-gray-50 hover:border-red-400'
                }`}
              >
                {isRecording ? (
                  <>
                    <div className="relative mb-3">
                      <div className="absolute inset-0 bg-red-500 rounded-full animate-ping opacity-75"></div>
                      <div className="relative bg-red-500 rounded-full p-3 text-white shadow-md">
                        <Mic size={24} />
                      </div>
                    </div>
                    <span className="font-semibold text-red-600">Recording...</span>
                    <span className="text-xs text-red-500 mt-1">Click to stop & save</span>
                  </>
                ) : (
                  <>
                    <Mic size={40} className="text-gray-400 group-hover:text-red-500 mb-3" />
                    <span className="font-semibold text-gray-700">Record Mic</span>
                    <span className="text-xs text-gray-500 mt-1">Use browser mic</span>
                  </>
                )}
              </button>
            </div>
            
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="audio/*" 
              onChange={handleFileChange} 
            />
            
            {audioUrl && (
              <div className="space-y-6 mt-8 pt-6 border-t border-gray-100 animate-in fade-in duration-500">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Preview: {file?.name}</h3>
                </div>
                
                <WaveformPlayer audioUrl={audioUrl} />
                
                <div className="flex justify-end">
                  <button 
                    onClick={handleAnalyze}
                    disabled={step !== 'idle' && step !== 'complete'}
                    className={`px-8 py-3 rounded-xl font-bold text-white transition-all flex items-center gap-2 ${
                      step !== 'idle' && step !== 'complete'
                        ? 'bg-blue-400 cursor-not-allowed' 
                        : 'bg-blue-600 hover:bg-blue-700 shadow-md hover:shadow-lg'
                    }`}
                  >
                    <Activity size={20} />
                    {step !== 'idle' && step !== 'complete' ? 'Analyzing...' : 'Analyze Audio'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Progress */}
          {renderProgress()}

          {/* Results */}
          {result && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className={`p-6 border-b ${
                result.isSynthetic ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'
              }`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      {result.isSynthetic ? (
                        <AlertTriangle className="text-red-600" size={28} />
                      ) : (
                        <CheckCircle className="text-green-600" size={28} />
                      )}
                      <h2 className={`text-2xl font-black ${result.isSynthetic ? 'text-red-700' : 'text-green-700'}`}>
                        {result.isSynthetic ? 'SYNTHETIC VOICE' : 'REAL HUMAN VOICE'}
                      </h2>
                    </div>
                    <p className="text-sm text-gray-600 font-medium">Analyzed: {result.fileName}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-black text-gray-900">
                      {(result.confidence * 100).toFixed(1)}%
                    </div>
                    <div className="text-sm text-gray-500 font-medium uppercase tracking-wide">Confidence</div>
                  </div>
                </div>
              </div>
              
              <div className="p-6 bg-white">
                <h3 className="text-lg font-bold mb-4 text-gray-800">Detailed Metrics</h3>
                
                <div className="space-y-4">
                  {[
                    { label: 'Spectrogram Analysis', value: result.metrics.spectrogram },
                    { label: 'Pitch Consistency', value: result.metrics.pitchConsistency },
                    { label: 'Noise Artifacts', value: result.metrics.noiseArtifacts },
                  ].map((metric) => (
                    <div key={metric.label}>
                      <div className="flex justify-between text-sm font-medium mb-1">
                        <span className="text-gray-700">{metric.label}</span>
                        <span className="text-gray-900">{(metric.value * 100).toFixed(0)}% Fake</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2.5">
                        <div 
                          className={`h-2.5 rounded-full ${metric.value > 0.5 ? 'bg-red-500' : 'bg-green-500'}`} 
                          style={{ width: `${metric.value * 100}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-8 p-4 bg-gray-50 rounded-xl border border-gray-200">
                  <div className="flex items-center gap-2 mb-2 text-gray-700 font-semibold">
                    <Activity size={18} />
                    Model Visualization
                  </div>
                  <div className="w-full h-32 bg-gray-800 rounded-lg flex items-center justify-center text-gray-400 text-sm font-medium border border-gray-700">
                    [Spectrogram Rendering Area]
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar / History */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 sticky top-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Clock size={20} className="text-gray-400" />
                Recent Scans
              </h3>
            </div>
            
            {history.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p className="text-sm">No recent scans.</p>
                <p className="text-xs mt-1">Upload a file to see history.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((item) => (
                  <div key={item.id} className="group p-3 rounded-xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50 transition-colors cursor-pointer flex items-center justify-between">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className={`w-2 h-10 rounded-full flex-shrink-0 ${item.isSynthetic ? 'bg-red-500' : 'bg-green-500'}`}></div>
                      <div className="truncate">
                        <p className="text-sm font-semibold text-gray-900 truncate" title={item.fileName}>
                          {item.fileName}
                        </p>
                        <p className="text-xs text-gray-500">
                          {item.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} • {(item.confidence * 100).toFixed(0)}%
                        </p>
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-gray-400 group-hover:text-blue-500 flex-shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
