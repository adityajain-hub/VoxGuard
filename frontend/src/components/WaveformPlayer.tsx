import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { Play, Pause } from 'lucide-react';

interface WaveformPlayerProps {
  audioUrl: string;
}

export default function WaveformPlayer({ audioUrl }: WaveformPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const wavesurfer = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#9ca3af', // gray-400
      progressColor: '#3b82f6', // blue-500
      cursorColor: '#2563eb', // blue-600
      barWidth: 2,
      barGap: 3,
      barRadius: 2,
      height: 64,
      normalize: true,
    });

    wavesurfer.load(audioUrl);

    wavesurfer.on('play', () => setIsPlaying(true));
    wavesurfer.on('pause', () => setIsPlaying(false));
    wavesurfer.on('finish', () => setIsPlaying(false));

    wavesurferRef.current = wavesurfer;

    return () => {
      wavesurfer.destroy();
    };
  }, [audioUrl]);

  const togglePlay = () => {
    if (wavesurferRef.current) {
      wavesurferRef.current.playPause();
    }
  };

  return (
    <div className="flex items-center gap-4 bg-mt-bg p-4 rounded-xl border border-gray-200 shadow-none">
      <button
        onClick={togglePlay}
        className="w-12 h-12 flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-mt-bg rounded-full transition-colors flex-shrink-0"
      >
        {isPlaying ? <Pause size={24} /> : <Play size={24} className="ml-1" />}
      </button>
      <div className="flex-grow overflow-hidden" ref={containerRef}></div>
    </div>
  );
}
