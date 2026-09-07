import { useState, useRef, useEffect } from 'react';
import { UploadCloud, Mic, Activity, CheckCircle, AlertTriangle, Clock, ChevronRight, BarChart2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import WaveformPlayer from '../components/WaveformPlayer';
import type { AnalysisResult, AnalysisStep } from '../types';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  
  const [step, setStep] = useState<AnalysisStep>('idle');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  
  const [history, setHistory] = useState<AnalysisResult[]>([]);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await fetch('http://localhost:8000/api/history', {
          headers: {
            'X-API-Key': 'SIH-VOX-2026'
          }
        });
        if (response.ok) {
          const data = await response.json();
          // Map backend history format to frontend AnalysisResult
          const formattedHistory: AnalysisResult[] = data.map((item: any) => ({
            id: item.id.toString(),
            fileName: item.filename,
            timestamp: item.timestamp,
            isSynthetic: item.deepfake_prob > 0.5,
            confidence: item.deepfake_prob,
            spectrogramUrl: item.spectrogram_url ? `http://localhost:8000${item.spectrogram_url}` : undefined,
            metrics: {
              speakerMatchScore: item.speaker_match,
              metadataRiskFlag: false, // Defaulting as not saved in db
              overallRiskScore: 0,     // Defaulting as not saved in db
              label: '',
              recommendedAction: item.action_taken
            }
          }));
          setHistory(formattedHistory);
        }
      } catch (err) {
        console.error("Failed to load history:", err);
      }
    };
    fetchHistory();
  }, []);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // A helper to encode Float32Array to WAV Blob
  const encodeWAV = (samples: Float32Array, sampleRate: number): Blob => {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    
    const writeString = (view: DataView, offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, samples.length * 2, true);
    
    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
      let s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    
    return new Blob([view], { type: 'audio/wav' });
  };

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const chunkBufferRef = useRef<Float32Array>(new Float32Array(0));
  const fullBufferRef = useRef<Float32Array>(new Float32Array(0));

  const [isLiveIntercepting, setIsLiveIntercepting] = useState(false);
  const [isForensicRecording, setIsForensicRecording] = useState(false);

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

  const cleanupAudio = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
  }

  // --- LIVE INTERCEPT MODE ---
  const startLiveIntercept = async () => {
    try {
      setStep('analyzing');
      const ws = new WebSocket('ws://localhost:8000/ws/analyze/live');
      wsRef.current = ws;
      
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.error) return;
        
        const isSynthetic = data.deepfake_probability > 0.5;
        const liveResult: AnalysisResult = {
          id: Math.random().toString(36).substring(7),
          fileName: `Live Stream chunk #${data.chunk}`,
          timestamp: new Date().toISOString(),
          isSynthetic,
          confidence: data.deepfake_probability,
          metrics: {
            speakerMatchScore: data.speaker_match_score,
            metadataRiskFlag: false,
            overallRiskScore: data.overall_risk_score,
            label: data.label,
            recommendedAction: data.recommended_action
          }
        };
        setResult(liveResult);
        setStep('complete');
      };

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });
      mediaStreamRef.current = stream;
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;
      await audioContext.audioWorklet.addModule('/audio-processor.js');
      
      const source = audioContext.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(audioContext, 'audio-processor');
      workletNodeRef.current = workletNode;
      chunkBufferRef.current = new Float32Array(0);
      
      workletNode.port.onmessage = (e) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        const newData = e.data as Float32Array;
        const newBuffer = new Float32Array(chunkBufferRef.current.length + newData.length);
        newBuffer.set(chunkBufferRef.current);
        newBuffer.set(newData, chunkBufferRef.current.length);
        chunkBufferRef.current = newBuffer;
        
        if (chunkBufferRef.current.length >= 32000) {
          const wavBlob = encodeWAV(chunkBufferRef.current, audioContext.sampleRate);
          wsRef.current.send(wavBlob);
          chunkBufferRef.current = new Float32Array(0);
        }
      };
      
      source.connect(workletNode);
      // Removed workletNode.connect(audioContext.destination) to prevent feedback loop
      setIsLiveIntercepting(true);
    } catch (err: any) {
      console.error("Error:", err);
      alert(`Could not start Live Intercept: ${err.message || err}`);
      setStep('idle');
    }
  };

  const stopLiveIntercept = () => {
    cleanupAudio();
    setIsLiveIntercepting(false);
    setStep('idle');
  };

  // --- FORENSIC RECORDING MODE ---
  const startForensicRecording = async () => {
    try {
      setFile(null);
      setAudioUrl(null);
      setResult(null);
      setStep('idle');
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });
      mediaStreamRef.current = stream;
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;
      await audioContext.audioWorklet.addModule('/audio-processor.js');
      
      const source = audioContext.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(audioContext, 'audio-processor');
      workletNodeRef.current = workletNode;
      fullBufferRef.current = new Float32Array(0);
      
      workletNode.port.onmessage = (e) => {
        const newData = e.data as Float32Array;
        const newBuffer = new Float32Array(fullBufferRef.current.length + newData.length);
        newBuffer.set(fullBufferRef.current);
        newBuffer.set(newData, fullBufferRef.current.length);
        fullBufferRef.current = newBuffer;
      };
      
      source.connect(workletNode);
      // Removed workletNode.connect(audioContext.destination) to prevent feedback loop
      setIsForensicRecording(true);
    } catch (err: any) {
      console.error("Error:", err);
      alert(`Could not start Forensic Recording: ${err.message || err}`);
    }
  };

  const stopForensicRecording = () => {
    if (fullBufferRef.current.length > 0) {
      const wavBlob = encodeWAV(fullBufferRef.current, audioContextRef.current?.sampleRate || 16000);
      const recordedFile = new File([wavBlob], `Forensic_${new Date().toISOString().slice(11, 19).replace(/:/g, '-')}.wav`, { type: 'audio/wav' });
      setFile(recordedFile);
      setAudioUrl(URL.createObjectURL(recordedFile));
    }
    cleanupAudio();
    setIsForensicRecording(false);
  };

  // Real Analysis Process
  const handleAnalyze = async () => {
    if (!file) return;
    
    setStep('extracting');
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('caller_id', 'Unknown');
      formData.append('amount', '0');

      setStep('analyzing');
      const response = await fetch('http://localhost:8000/api/analyze/forensic', {
        method: 'POST',
        headers: {
          'X-API-Key': 'SIH-VOX-2026'
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      setStep('finalizing');
      
      const isSynthetic = data.deepfake_probability > 0.5;
      const newResult: AnalysisResult = {
        id: Math.random().toString(36).substring(7),
        fileName: data.filename || file.name,
        timestamp: new Date().toISOString(),
        isSynthetic,
        confidence: data.deepfake_probability,
        spectrogramUrl: data.spectrogram_url ? `http://localhost:8000${data.spectrogram_url}` : undefined,
        metrics: {
          speakerMatchScore: data.speaker_match_score,
          metadataRiskFlag: data.metadata_risk_flag,
          overallRiskScore: data.overall_risk_score,
          label: data.label,
          recommendedAction: data.recommended_action
        }
      };
      
      setResult(newResult);
      setStep('complete');
      setHistory(prev => [newResult, ...prev]);
    } catch (err) {
      console.error(err);
      setStep('idle');
      alert("Failed to analyze audio. Is the backend running?");
    }
  };

  const renderProgress = () => {
    if (step === 'idle' || step === 'complete') return null;
    
    const steps = [
      { id: 'extracting', label: 'Extracting features...' },
      { id: 'analyzing', label: 'Running through model...' },
      { id: 'finalizing', label: 'Finalizing score...' }
    ];
    
    const currentIndex = steps.findIndex(s => s.id === step);
    
    return (
      <div className="bg-mt-subalt p-6 rounded-xl shadow-none border-b-2 border-r-2 border-mt-sub border border-mt-subalt mt-6 animate-in fade-in">
        <div className="flex items-center justify-between">
          {steps.map((s, idx) => (
            <div key={s.id} className="flex flex-col items-center flex-1">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2 transition-colors ${
                idx < currentIndex ? 'bg-mt-main text-mt-bg' : 
                idx === currentIndex ? 'bg-indigo-900 text-mt-bg animate-pulse' : 
                'bg-mt-subalt text-mt-sub'
              }`}>
                {idx < currentIndex ? <CheckCircle size={20} /> : <Activity size={20} />}
              </div>
              <span className={`text-sm font-medium ${idx <= currentIndex ? 'text-mt-text' : 'text-mt-sub'}`}>
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-mt-subalt text-mt-text font-sans tracking-tight p-6 md:p-8 lg:p-12">
      <header className="max-w-7xl mx-auto mb-10">
        <h1 className="text-3xl font-extrabold tracking-tight text-mt-text flex items-center gap-3">
          <Activity className="text-mt-main" size={32} />
          Synthetic Voice <span className="text-mt-main">Detector</span>
        </h1>
        <p className="text-mt-sub mt-2">Upload or record audio to detect deepfakes and AI-generated voices.</p>
      </header>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
        
        {/* Left Column */}
        <div className="lg:col-span-6 xl:col-span-5 space-y-6">
          
          <div className="bg-[#3a3d40] p-6 rounded-xl shadow-none border border-mt-sub/30">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-2">
              <button 
                onClick={() => !isForensicRecording && !isLiveIntercepting && fileInputRef.current?.click()}
                disabled={isForensicRecording || isLiveIntercepting}
                className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-xl transition-all group ${
                  isForensicRecording || isLiveIntercepting
                    ? 'border-mt-subalt bg-mt-subalt opacity-50 cursor-not-allowed' 
                    : 'border-mt-sub hover:bg-mt-subalt hover:border-mt-main'
                }`}
              >
                <UploadCloud size={32} className={`mb-3 ${isForensicRecording || isLiveIntercepting ? 'text-mt-sub' : 'text-mt-sub group-hover:text-mt-main'}`} />
                <span className="font-semibold text-mt-text text-sm text-center">Upload Audio</span>
                <span className="text-xs text-mt-sub mt-1 text-center">WAV, MP3, FLAC</span>
              </button>
              
              <button 
                onClick={isForensicRecording ? stopForensicRecording : startForensicRecording}
                disabled={isLiveIntercepting}
                className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-xl transition-all group ${
                  isLiveIntercepting
                    ? 'border-mt-subalt bg-mt-subalt opacity-50 cursor-not-allowed'
                    : isForensicRecording 
                    ? 'border-mt-error bg-mt-subalt hover:bg-mt-subalt' 
                    : 'border-mt-sub hover:bg-mt-subalt hover:border-mt-error'
                }`}
              >
                {isForensicRecording ? (
                  <>
                    <div className="relative mb-3">
                      <div className="absolute inset-0 bg-mt-error rounded-full animate-ping opacity-75"></div>
                      <div className="relative bg-mt-error rounded-full p-2 text-mt-bg shadow-none">
                        <Mic size={20} />
                      </div>
                    </div>
                    <span className="font-semibold text-mt-error text-sm text-center">Recording...</span>
                    <span className="text-xs text-mt-error mt-1 text-center">Click to stop</span>
                  </>
                ) : (
                  <>
                    <Mic size={32} className="text-mt-sub group-hover:text-mt-error mb-3" />
                    <span className="font-semibold text-mt-text text-sm text-center">Record Mic</span>
                    <span className="text-xs text-mt-sub mt-1 text-center">Forensic Analysis</span>
                  </>
                )}
              </button>

              <button 
                onClick={isLiveIntercepting ? stopLiveIntercept : startLiveIntercept}
                disabled={isForensicRecording}
                className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-xl transition-all group ${
                  isForensicRecording
                    ? 'border-mt-subalt bg-mt-subalt opacity-50 cursor-not-allowed'
                    : isLiveIntercepting 
                    ? 'border-mt-main bg-mt-subalt hover:bg-mt-subalt' 
                    : 'border-mt-sub hover:bg-mt-subalt hover:border-mt-main'
                }`}
              >
                {isLiveIntercepting ? (
                  <>
                    <div className="relative mb-3">
                      <div className="absolute inset-0 bg-mt-main rounded-full animate-ping opacity-75"></div>
                      <div className="relative bg-mt-main rounded-full p-2 text-mt-bg shadow-none">
                        <Activity size={20} />
                      </div>
                    </div>
                    <span className="font-semibold text-mt-main text-sm text-center">Intercepting...</span>
                    <span className="text-xs text-mt-main mt-1 text-center">Live WebSocket</span>
                  </>
                ) : (
                  <>
                    <Activity size={32} className="text-mt-sub group-hover:text-mt-main mb-3" />
                    <span className="font-semibold text-mt-text text-sm text-center">Live Intercept</span>
                    <span className="text-xs text-mt-sub mt-1 text-center">Real-Time Monitor</span>
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
              <div className="space-y-4 mt-6 pt-6 border-t border-mt-subalt animate-in fade-in duration-500">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-mt-sub uppercase tracking-wider">Preview: {file?.name}</h3>
                </div>
                
                <WaveformPlayer audioUrl={audioUrl} />
                
                <div className="flex justify-end pt-2">
                  <button 
                    onClick={handleAnalyze}
                    disabled={step !== 'idle' && step !== 'complete'}
                    className={`w-full py-3 rounded-xl font-bold text-mt-bg transition-all flex items-center justify-center gap-2 ${
                      step !== 'idle' && step !== 'complete'
                        ? 'bg-mt-main text-mt-bg cursor-not-allowed' 
                        : 'bg-indigo-900 hover:bg-blue-700 shadow-none hover:shadow-none'
                    }`}
                  >
                    <Activity size={20} />
                    {step !== 'idle' && step !== 'complete' ? 'Analyzing...' : 'Analyze Audio'}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="bg-[#3a3d40] p-6 rounded-xl shadow-none border border-mt-sub/30">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-mt-text flex items-center gap-2">
                <Clock size={20} className="text-mt-sub" />
                Recent Scans
              </h3>
              <Link to="/history" className="text-sm font-semibold text-mt-main hover:text-blue-800 transition-colors">
                View All &rarr;
              </Link>
            </div>
            
            {history.length === 0 ? (
              <div className="text-center py-6 text-mt-sub bg-mt-subalt rounded-xl border border-mt-subalt border-dashed">
                <p className="text-sm">No recent scans.</p>
                <p className="text-xs mt-1">Upload a file to see history.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {history.slice(0, 5).map((item) => {
                  const date = new Date(item.timestamp);
                  return (
                    <div key={item.id} onClick={() => { setResult(item); setStep('complete'); }} className="group p-3 rounded-xl border border-mt-subalt hover:border-blue-200 hover:bg-mt-subalt transition-colors cursor-pointer flex items-center justify-between">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className={`w-2 h-10 rounded-none flex-shrink-0 ${item.isSynthetic ? 'bg-mt-error' : 'bg-mt-main'}`}></div>
                        <div className="truncate">
                          <p className="text-sm font-semibold text-mt-text truncate" title={item.fileName}>
                            {item.fileName}
                          </p>
                          <p className="text-xs text-mt-sub">
                            {date.toLocaleDateString()} at {date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} • {((item.confidence < 0 ? 0 : (item.isSynthetic ? item.confidence : 1 - item.confidence)) * 100).toFixed(0)}%
                          </p>
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-mt-sub group-hover:text-mt-main flex-shrink-0" />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* Right Column (Spectrogram & Results) */}
        <div className="lg:col-span-6 xl:col-span-7 space-y-6">
          
          <div className="bg-[#3a3d40] p-6 rounded-xl shadow-none border border-mt-sub/30 flex flex-col h-[600px]">
            <h3 className="text-lg font-bold text-mt-text mb-4 flex items-center gap-2">
              <BarChart2 size={20} className="text-mt-sub" />
              ML Spectrogram Analysis
            </h3>
            
            <div className="w-full flex-grow bg-[#2f3134] rounded-xl flex items-center justify-center border border-mt-sub/20 shadow-inner overflow-hidden relative">
              {result ? (
                result.spectrogramUrl ? (
                  <img src={result.spectrogramUrl} alt="Spectrogram" className="w-full h-full object-fill" />
                ) : (
                  <div className="text-center space-y-2 animate-in fade-in">
                    <p className="text-mt-main font-mono text-sm">No Spectrogram Available</p>
                  </div>
                )
              ) : step !== 'idle' ? (
                <div className="text-mt-main font-mono text-sm animate-pulse flex items-center gap-2">
                  <Activity size={16} /> Generating Spectrogram...
                </div>
              ) : (
                <p className="text-mt-sub font-medium text-sm">Waiting for audio upload...</p>
              )}
            </div>
          </div>

          {renderProgress()}

          {result && (
            <div className="bg-[#3a3d40] rounded-xl shadow-lg border border-mt-sub/30 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className={`p-6 border-b ${
                result.metrics.label === 'LISTENING_SILENCE' || result.metrics.label === 'AWAITING_SPEECH'
                  ? 'bg-blue-50 border-blue-100'
                  : result.isSynthetic ? 'bg-[#404347] border-mt-error/30' : 'bg-[#404347] border-mt-main/30'
              }`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      {result.metrics.label === 'LISTENING_SILENCE' || result.metrics.label === 'AWAITING_SPEECH' ? (
                        <Activity className="text-blue-600" size={28} />
                      ) : result.isSynthetic ? (
                        <AlertTriangle className="text-mt-error" size={28} />
                      ) : (
                        <CheckCircle className="text-mt-main" size={28} />
                      )}
                      <h2 className={`text-2xl font-black ${
                        result.metrics.label === 'LISTENING_SILENCE' || result.metrics.label === 'AWAITING_SPEECH'
                          ? 'text-blue-700'
                          : result.isSynthetic ? 'text-mt-error' : 'text-mt-main'
                      }`}>
                        {result.metrics.label === 'LISTENING_SILENCE' || result.metrics.label === 'AWAITING_SPEECH' 
                          ? 'LISTENING FOR VOICE...' 
                          : result.isSynthetic ? 'SYNTHETIC VOICE' : 'REAL HUMAN VOICE'}
                      </h2>
                    </div>
                    <p className="text-sm text-mt-sub font-medium">Analyzed: {result.fileName}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-mono font-bold tracking-tighter text-mt-text">
                      {result.metrics.label === 'LISTENING_SILENCE' || result.metrics.label === 'AWAITING_SPEECH' 
                        ? '--%'
                        : `${((result.confidence < 0 ? 0 : (result.isSynthetic ? result.confidence : (1 - result.confidence))) * 100).toFixed(1)}%`}
                    </div>
                    <div className="text-sm text-mt-sub font-medium uppercase tracking-wide">
                      {result.metrics.label === 'LISTENING_SILENCE' || result.metrics.label === 'AWAITING_SPEECH' 
                        ? 'Awaiting Input'
                        : result.isSynthetic ? 'Deepfake Confidence' : 'Authentic (Real Voice) Confidence'}
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="p-6 bg-[#3a3d40]">
                <h3 className="text-lg font-bold mb-4 text-mt-text">Model Metrics Breakdown</h3>
                
                <div className="space-y-5">
                  {[
                    { label: 'Speaker Match Score', value: result.metrics.speakerMatchScore, displayValue: `${(result.metrics.speakerMatchScore * 100).toFixed(0)}%` },
                    { label: 'Overall Risk Score', value: result.metrics.overallRiskScore / 100, displayValue: `${result.metrics.overallRiskScore}/100` },
                    { label: 'Metadata Risk Flag', value: result.metrics.metadataRiskFlag ? 1 : 0, displayValue: result.metrics.metadataRiskFlag ? 'True' : 'False' },
                  ].map((metric) => (
                    <div key={metric.label}>
                      <div className="flex justify-between text-sm font-medium mb-1">
                        <span className="text-mt-text uppercase tracking-wider text-xs">{metric.label}</span>
                        <span className="text-mt-text font-mono tracking-tighter">{metric.displayValue}</span>
                      </div>
                      <div className="w-full bg-mt-subalt rounded-none h-2.5">
                        <div 
                          className={`h-2.5 rounded-none ${metric.value > 0.5 ? 'bg-mt-error' : 'bg-mt-main'}`} 
                          style={{ width: `${Math.max(5, metric.value * 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                  
                  <div className="mt-4 p-4 bg-mt-subalt rounded-xl border border-mt-subalt">
                    <p className="text-sm text-mt-sub font-semibold mb-1 uppercase tracking-wider">Recommended Action</p>
                    <p className="text-md font-bold text-mt-text">{result.metrics.recommendedAction}</p>
                    <p className="text-xs text-mt-sub mt-2">Label: {result.metrics.label}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
