import { useState, useEffect } from 'react';
import { Clock, ArrowLeft, Trash2, CheckCircle, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { AnalysisResult } from '../types';

export default function HistoryPage() {
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
          const formattedHistory: AnalysisResult[] = data.map((item: any) => ({
            id: item.id.toString(),
            fileName: item.filename,
            timestamp: item.timestamp,
            isSynthetic: item.deepfake_prob > 0.5,
            confidence: item.deepfake_prob,
            metrics: {
              speakerMatchScore: item.speaker_match,
              metadataRiskFlag: false,
              overallRiskScore: 0,
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

  const clearHistory = () => {
    if (window.confirm("Clearing history is not yet supported by the backend API.")) {
      // Future API call to DELETE /api/history
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans tracking-tight p-6 md:p-8 lg:p-12">
      <div className="max-w-4xl mx-auto">
        
        <header className="mb-8 flex items-center justify-between">
          <div>
            <Link to="/" className="inline-flex items-center text-sm font-semibold text-slate-500 hover:text-indigo-900 mb-4 transition-colors">
              <ArrowLeft size={16} className="mr-1" />
              Back to Dashboard
            </Link>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-3">
              <Clock className="text-indigo-900" size={32} />
              All Recent Scans
            </h1>
          </div>
          
          {history.length > 0 && (
            <button 
              onClick={clearHistory}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
            >
              <Trash2 size={16} />
              Clear History
            </button>
          )}
        </header>

        <div className="bg-white rounded-sm shadow-none border-b-2 border-r-2 border-slate-300 border border-slate-200 overflow-hidden">
          {history.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              <Clock size={48} className="mx-auto mb-4 text-slate-300" />
              <p className="text-lg font-medium text-slate-900 mb-1">No scan history found</p>
              <p className="text-sm">You haven't analyzed any audio files yet.</p>
              <Link to="/" className="inline-block mt-6 px-6 py-2 bg-indigo-900 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors">
                Go Analyze Audio
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {history.map((item) => {
                const date = new Date(item.timestamp);
                return (
                  <div key={item.id} className="p-6 hover:bg-slate-50 transition-colors flex items-center justify-between flex-wrap gap-4">
                    
                    <div className="flex items-start gap-4">
                      <div className={`mt-1 flex-shrink-0 w-12 h-12 rounded-none flex items-center justify-center ${
                        item.isSynthetic ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'
                      }`}>
                        {item.isSynthetic ? <AlertTriangle size={24} /> : <CheckCircle size={24} />}
                      </div>
                      
                      <div>
                        <h3 className="font-bold text-slate-900 text-lg mb-1">{item.fileName}</h3>
                        <p className="text-sm text-slate-500 flex items-center gap-2">
                          <Clock size={14} />
                          {date.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })} at {date.toLocaleTimeString()}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-8">
                      <div className="text-right">
                        <div className={`text-xl font-black ${item.isSynthetic ? 'text-red-600' : 'text-green-600'}`}>
                          {item.isSynthetic ? 'SYNTHETIC' : 'REAL'}
                        </div>
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Verdict</div>
                      </div>
                      
                      <div className="text-right">
                        <div className="text-xl font-black text-slate-900">
                          {(item.confidence * 100).toFixed(1)}%
                        </div>
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Confidence</div>
                      </div>
                    </div>
                    
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
