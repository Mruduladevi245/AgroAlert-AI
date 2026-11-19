import React, { useEffect, useRef, useState } from 'react';
import {
  Languages,
  Loader2,
  Mic,
  MicOff,
  RotateCcw,
  Send,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import { SUPPORTED_LANGUAGES } from '../../shared/languages.ts';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest } from '../services/api.ts';
import { AudioPlayerButton } from './AudioPlayerButton.tsx';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  languageCode: string;
  provider?: string;
  isFallback?: boolean;
}

export function VoiceAssistantDrawer() {
  const {
    user,
    selectedField,
    languageCode,
    setLanguageCode,
    languageCapabilities,
    voiceDrawerOpen,
    setVoiceDrawerOpen,
    voicePromptPrefill,
  } = useApp();

  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [sttStatus, setSttStatus] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [lastSttProvider, setLastSttProvider] = useState('text');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    if (voicePromptPrefill) {
      setQuestion(voicePromptPrefill);
    }
  }, [voicePromptPrefill]);

  if (!user) return null;

  const currentLangCap = languageCapabilities.find((l) => l.code === languageCode);

  async function startRecordingOrSpeech() {
    setErrorMsg('');
    setSttStatus('');

    // Prefer genuine server-side multilingual transcription (Gemini 3.5 Transcribe) via MediaRecorder
    if (currentLangCap?.sttServerAvailable && navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
        const recorder = new MediaRecorder(stream, { mimeType });
        audioChunksRef.current = [];

        recorder.ondataavailable = (ev) => {
          if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
        };

        recorder.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          setListening(false);
          const blob = new Blob(audioChunksRef.current, { type: mimeType });
          if (blob.size < 400) {
            setSttStatus('Recording was too short. Please speak clearly and try again.');
            return;
          }
          setTranscribing(true);
          setSttStatus(`Transcribing ${languageCode} speech...`);
          try {
            const reader = new FileReader();
            const base64Audio: string = await new Promise((resolve, reject) => {
              reader.onloadend = () => resolve(String(reader.result || ''));
              reader.onerror = () => reject(new Error('Failed to read audio recording.'));
              reader.readAsDataURL(blob);
            });
            const res = await apiRequest<{
              ok: boolean;
              transcript: string;
              provider: string;
              error?: string;
            }>('/api/voice/recognize', {
              method: 'POST',
              body: JSON.stringify({
                audioBase64: base64Audio,
                mimeType,
                languageCode,
              }),
            });
            if (res.ok && res.transcript) {
              setQuestion(res.transcript);
              setLastSttProvider(res.provider);
              setSttStatus(`Recognized via ${res.provider}. Review or edit before sending.`);
            } else {
              setErrorMsg(res.error || 'Could not transcribe audio.');
              setSttStatus('');
            }
          } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : 'Transcription error.');
            setSttStatus('');
          } finally {
            setTranscribing(false);
          }
        };

        mediaRecorderRef.current = recorder;
        recorder.start();
        setListening(true);
        setSttStatus(`Listening (${languageCode})... Click Stop when finished speaking.`);
        return;
      } catch {
        // Fall through to browser Web Speech Recognition if mic permission or MediaRecorder fails
      }
    }

    // Fallback: Browser Web Speech API in exact selected language locale
    const SpeechRec =
      (window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition;

    if (!SpeechRec) {
      setErrorMsg(
        `Speech recognition is not supported in this browser for ${languageCode}. Please type your question below.`
      );
      return;
    }

    try {
      const rec = new SpeechRec() as {
        lang: string;
        interimResults: boolean;
        continuous: boolean;
        onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
        onerror: (e: { error: string }) => void;
        onend: () => void;
        start: () => void;
        stop: () => void;
      };
      rec.lang = languageCode;
      rec.interimResults = true;
      rec.continuous = false;
      rec.onresult = (event) => {
        let combined = '';
        for (let i = 0; i < event.results.length; i++) {
          combined += event.results[i][0].transcript + ' ';
        }
        setQuestion(combined.trim());
        setLastSttProvider('browser-speech-recognition');
      };
      rec.onerror = (e) => {
        setListening(false);
        setErrorMsg(`Browser speech recognition error (${e.error}) for ${languageCode}.`);
      };
      rec.onend = () => {
        setListening(false);
      };
      recognitionRef.current = rec;
      rec.start();
      setListening(true);
      setSttStatus(`Browser listening in ${languageCode}...`);
    } catch {
      setErrorMsg('Unable to start microphone recognition.');
    }
  }

  function stopListening() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setListening(false);
  }

  async function handleSendQuestion(overrideText?: string) {
    const q = (overrideText ?? question).trim();
    if (!q) return;

    setErrorMsg('');
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: q,
      languageCode,
    };
    setMessages((prev) => [...prev, userMsg]);
    if (!overrideText) setQuestion('');
    setSending(true);

    try {
      const res = await apiRequest<{
        answer: string;
        languageCode: string;
        provider: string;
        isFallback: boolean;
      }>('/api/voice/assistant', {
        method: 'POST',
        body: JSON.stringify({
          question: q,
          fieldId: selectedField?.id ?? null,
          languageCode,
          sttProvider: lastSttProvider,
        }),
      });

      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: res.answer,
        languageCode: res.languageCode,
        provider: res.provider,
        isFallback: res.isFallback,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setLastSttProvider('text');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Assistant request failed.');
    } finally {
      setSending(false);
    }
  }

  const quickPrompts = [
    "Will tomorrow's rainfall affect my crop?",
    'Is my standing water level suitable right now?',
    'What should I do during extreme heat?',
    'Why did my field receive its current risk rating?',
  ];

  return (
    <>
      {!voiceDrawerOpen && (
        <button
          type="button"
          onClick={() => setVoiceDrawerOpen(true)}
          aria-label="Open Multilingual Voice Assistant"
          className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 px-4 py-3 bg-emerald-700 text-white rounded-full shadow-lg hover:bg-emerald-800 transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          <Mic className="w-5 h-5" />
          <span className="text-sm font-medium whitespace-nowrap">Voice Assistant</span>
        </button>
      )}

      {voiceDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-[2px]">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 h-full flex flex-col border-l border-stone-200 dark:border-slate-800 shadow-2xl">
            {/* Header */}
            <div className="px-5 py-4 border-b border-stone-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  Multilingual Voice Agronomist
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {selectedField ? `${selectedField.name} · ${selectedField.crop_id}` : 'Global mode'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {messages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setMessages([])}
                    title="Clear conversation"
                    className="p-2 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded-lg hover:bg-stone-100 dark:hover:bg-slate-800"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setVoiceDrawerOpen(false)}
                  aria-label="Close Voice Assistant"
                  className="p-2 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded-lg hover:bg-stone-100 dark:hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Centralized Language & Capability Bar */}
            <div className="px-5 py-3 bg-stone-50 dark:bg-slate-950/60 border-b border-stone-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                  <Languages className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Voice & Answer Language</span>
                </label>
                <select
                  value={languageCode}
                  onChange={(e) => setLanguageCode(e.target.value)}
                  className="text-xs px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-700 rounded-lg"
                >
                  {SUPPORTED_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label} — {l.nativeLabel}
                    </option>
                  ))}
                </select>
              </div>

              {currentLangCap && (
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600 dark:text-slate-400">
                  <span>
                    Translation:{' '}
                    <strong className={currentLangCap.translationAvailable ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700'}>
                      {currentLangCap.translationProvider}
                    </strong>
                  </span>
                  <span>·</span>
                  <span>
                    STT:{' '}
                    <strong className={currentLangCap.sttServerAvailable ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700'}>
                      {currentLangCap.sttProvider}
                    </strong>
                  </span>
                  <span>·</span>
                  <span>
                    TTS:{' '}
                    <strong className={currentLangCap.ttsServerAvailable ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700'}>
                      {currentLangCap.ttsProvider}
                    </strong>
                  </span>
                </div>
              )}
            </div>

            {/* Conversation Stream */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {messages.length === 0 && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    Speak or type your agricultural question in your selected language. Answers use live weather, water logs, and crop risk records for your active field.
                  </p>
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-slate-500">Suggested questions</p>
                    <div className="flex flex-col gap-1.5">
                      {quickPrompts.map((qp) => (
                        <button
                          key={qp}
                          type="button"
                          onClick={() => handleSendQuestion(qp)}
                          className="text-left text-xs px-3 py-2 rounded-lg border border-stone-200 dark:border-slate-800 hover:bg-stone-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors"
                        >
                          {qp}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[90%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-emerald-700 text-white'
                        : 'bg-stone-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-stone-200 dark:border-slate-700'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{m.text}</p>
                    {m.role === 'assistant' && (
                      <div className="mt-3 pt-2.5 border-t border-stone-200/80 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
                        <AudioPlayerButton
                          text={m.text}
                          languageCode={m.languageCode}
                          label="Play Voice"
                          compact
                        />
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          {m.isFallback ? 'Rule-based fallback' : m.provider}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {sending && (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-700" />
                  <span>Analyzing field context and generating answer in {languageCode}...</span>
                </div>
              )}
            </div>

            {/* Input & Speech Controls */}
            <div className="p-4 border-t border-stone-200 dark:border-slate-800 space-y-2.5 bg-white dark:bg-slate-900">
              {listening && (
                <div className="flex items-center justify-between px-3 py-2 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-lg">
                  <div className="flex items-center gap-2 text-xs font-medium text-emerald-800 dark:text-emerald-300">
                    <Volume2 className="w-4 h-4 animate-bounce" />
                    <span>{sttStatus || 'Recording voice...'}</span>
                  </div>
                  <button
                    type="button"
                    onClick={stopListening}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-red-600 text-white rounded-md hover:bg-red-700"
                  >
                    <MicOff className="w-3.5 h-3.5" />
                    <span>Stop</span>
                  </button>
                </div>
              )}

              {transcribing && (
                <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{sttStatus}</span>
                </div>
              )}

              {!listening && sttStatus && !transcribing && (
                <p className="text-xs text-slate-500 dark:text-slate-400">{sttStatus}</p>
              )}

              {errorMsg && (
                <div className="flex items-center justify-between gap-2 text-xs text-red-600 dark:text-red-400">
                  <span>{errorMsg}</span>
                  <button
                    type="button"
                    onClick={() => handleSendQuestion()}
                    className="inline-flex items-center gap-1 underline shrink-0"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Retry
                  </button>
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendQuestion();
                }}
                className="flex items-end gap-2"
              >
                <button
                  type="button"
                  onClick={listening ? stopListening : startRecordingOrSpeech}
                  disabled={transcribing || sending}
                  aria-label={listening ? 'Stop microphone' : 'Speak question'}
                  className={`p-2.5 rounded-lg border transition-colors shrink-0 ${
                    listening
                      ? 'bg-red-600 text-white border-red-600 hover:bg-red-700'
                      : 'bg-stone-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border-stone-200 dark:border-slate-700 hover:bg-stone-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {listening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
                <textarea
                  rows={2}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendQuestion();
                    }
                  }}
                  placeholder={`Ask in ${currentLangCap?.nativeLabel || languageCode} or type here...`}
                  className="flex-1 px-3 py-2 text-sm bg-stone-50 dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
                />
                <button
                  type="submit"
                  disabled={sending || !question.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-emerald-700 text-white text-sm font-medium rounded-lg hover:bg-emerald-800 disabled:opacity-50 shrink-0"
                >
                  <Send className="w-4 h-4" />
                  <span>Send</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
