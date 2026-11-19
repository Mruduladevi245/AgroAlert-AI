import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Pause, Play, RotateCcw, Square, Volume2 } from 'lucide-react';
import { apiFetchAudio } from '../services/api.ts';

interface AudioPlayerButtonProps {
  text: string;
  languageCode: string;
  label?: string;
  compact?: boolean;
}

export function AudioPlayerButton({
  text,
  languageCode,
  label = 'Listen',
  compact = false,
}: AudioPlayerButtonProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'playing' | 'paused' | 'error'>('idle');
  const [speed, setSpeed] = useState(1.0);
  const [providerLabel, setProviderLabel] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const utteranceModeRef = useRef(false);

  const cleanup = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    if (utteranceModeRef.current && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      utteranceModeRef.current = false;
    }
  };

  useEffect(() => {
    return () => cleanup();
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  }, [speed]);

  async function handlePlayOrResume() {
    if (status === 'paused' && audioRef.current) {
      await audioRef.current.play();
      setStatus('playing');
      return;
    }
    if (status === 'paused' && utteranceModeRef.current && 'speechSynthesis' in window) {
      window.speechSynthesis.resume();
      setStatus('playing');
      return;
    }

    cleanup();
    setStatus('loading');
    setErrorMsg('');

    const res = await apiFetchAudio({ text, languageCode });
    if (res.ok) {
      blobUrlRef.current = res.blobUrl;
      const audio = new Audio(res.blobUrl);
      audio.playbackRate = speed;
      audio.onended = () => setStatus('idle');
      audio.onerror = () => {
        setStatus('error');
        setErrorMsg('Audio playback error.');
      };
      audioRef.current = audio;
      setProviderLabel(res.provider);
      await audio.play();
      setStatus('playing');
      return;
    }

    // Fallback: Matching installed browser voice ONLY (never silently substitute English)
    if (res.fallbackToBrowser && 'speechSynthesis' in window) {
      const voices = window.speechSynthesis.getVoices();
      const targetLower = languageCode.toLowerCase();
      const langPrefix = targetLower.split('-')[0];
      const matchingVoice =
        voices.find((v) => v.lang.toLowerCase() === targetLower) ||
        voices.find((v) => v.lang.toLowerCase().startsWith(langPrefix + '-')) ||
        voices.find((v) => v.lang.toLowerCase() === langPrefix);

      if (matchingVoice) {
        const utt = new SpeechSynthesisUtterance(text);
        utt.voice = matchingVoice;
        utt.lang = matchingVoice.lang;
        utt.rate = speed;
        utt.onend = () => setStatus('idle');
        utt.onerror = () => {
          setStatus('error');
          setErrorMsg(`Browser voice synthesis failed for ${languageCode}.`);
        };
        utteranceModeRef.current = true;
        setProviderLabel(`Browser voice (${matchingVoice.name})`);
        window.speechSynthesis.speak(utt);
        setStatus('playing');
        return;
      }
    }

    setStatus('error');
    setErrorMsg(
      res.error ||
        `No compatible speech voice is available for ${languageCode} on server or browser.`
    );
  }

  function handlePause() {
    if (audioRef.current && status === 'playing') {
      audioRef.current.pause();
      setStatus('paused');
    } else if (utteranceModeRef.current && 'speechSynthesis' in window) {
      window.speechSynthesis.pause();
      setStatus('paused');
    }
  }

  function handleStop() {
    cleanup();
    setStatus('idle');
  }

  return (
    <div className="inline-flex flex-wrap items-center gap-2">
      {status === 'idle' || status === 'error' ? (
        <button
          type="button"
          onClick={handlePlayOrResume}
          className={`inline-flex items-center gap-1.5 ${
            compact ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-xs'
          } font-medium bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 transition-colors whitespace-nowrap shrink-0`}
        >
          <Volume2 className="w-3.5 h-3.5" />
          <span>{label}</span>
        </button>
      ) : status === 'loading' ? (
        <button
          type="button"
          disabled
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-stone-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg whitespace-nowrap shrink-0"
        >
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Generating audio...</span>
        </button>
      ) : (
        <div className="inline-flex items-center gap-1 bg-stone-100 dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-lg p-1">
          {status === 'playing' ? (
            <button
              type="button"
              onClick={handlePause}
              aria-label="Pause audio"
              className="p-1.5 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700 rounded-md"
            >
              <Pause className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handlePlayOrResume}
              aria-label="Resume audio"
              className="p-1.5 text-emerald-700 dark:text-emerald-400 hover:bg-white dark:hover:bg-slate-700 rounded-md"
            >
              <Play className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={handleStop}
            aria-label="Stop audio"
            className="p-1.5 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700 rounded-md"
          >
            <Square className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              handleStop();
              setTimeout(() => {
                handlePlayOrResume();
              }, 50);
            }}
            aria-label="Replay audio"
            className="p-1.5 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700 rounded-md"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <select
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            aria-label="Playback speed"
            className="text-xs font-mono bg-transparent px-1 py-0.5 text-slate-700 dark:text-slate-200 focus:outline-none"
          >
            <option value={0.85}>0.85x</option>
            <option value={1}>1.0x</option>
            <option value={1.2}>1.2x</option>
            <option value={1.4}>1.4x</option>
          </select>
        </div>
      )}

      {providerLabel && status !== 'idle' && (
        <span className="text-[11px] text-slate-500 dark:text-slate-400">{providerLabel}</span>
      )}
      {errorMsg && <span className="text-xs text-red-600 dark:text-red-400">{errorMsg}</span>}
    </div>
  );
}
