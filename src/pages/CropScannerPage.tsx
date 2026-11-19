import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Camera, Loader2, ScanLine, Upload, X } from 'lucide-react';
import { CROP_DATABASE } from '../../shared/crops.ts';
import { AudioPlayerButton } from '../components/AudioPlayerButton.tsx';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest } from '../services/api.ts';

interface ScanResponse {
  id: number;
  identifiedCrop: string;
  imageQuality: 'clear' | 'moderate' | 'unclear';
  symptoms: string[];
  possibleIssues: Array<{ name: string; likelihood: string; reasoning: string }>;
  uncertaintyNote: string;
  recommendations: string[];
  provider: string;
  isFallback: boolean;
}

export function CropScannerPage() {
  const { fields, selectedField, languageCode } = useApp();
  const [fieldId, setFieldId] = useState<number | ''>(selectedField?.id ?? '');
  const [cropId, setCropId] = useState(selectedField?.crop_id || 'rice');
  const [previewDataUrl, setPreviewDataUrl] = useState<string>('');
  const [mimeType, setMimeType] = useState<string>('image/jpeg');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Camera capture
  const [cameraOpen, setCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraOpen(false);
  }

  async function startCamera() {
    setErrorMsg('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMsg('Camera capture is not supported in this browser. Please upload a crop photo.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      setCameraOpen(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 60);
    } catch {
      setErrorMsg('Camera access denied or unavailable. Upload a crop image instead.');
    }
  }

  function captureSnapshot() {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1024;
    canvas.height = video.videoHeight || 768;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    setPreviewDataUrl(dataUrl);
    setMimeType('image/jpeg');
    setResult(null);
    stopCamera();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setErrorMsg('Please select a JPEG, PNG, or WEBP crop image.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setErrorMsg('Image exceeds 8 MB size limit.');
      return;
    }
    setErrorMsg('');
    setMimeType(file.type);
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewDataUrl(String(reader.result || ''));
      setResult(null);
    };
    reader.readAsDataURL(file);
  }

  async function handleAnalyze() {
    if (!previewDataUrl) {
      setErrorMsg('Upload or capture a crop photo first.');
      return;
    }
    setAnalyzing(true);
    setErrorMsg('');
    try {
      const res = await apiRequest<ScanResponse>('/api/crop/scan', {
        method: 'POST',
        body: JSON.stringify({
          fieldId: fieldId || null,
          cropId,
          imageBase64: previewDataUrl,
          mimeType,
          languageCode,
        }),
      });
      setResult(res);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Crop scan failed.');
    } finally {
      setAnalyzing(false);
    }
  }

  const spokenSummary = result
    ? `${result.identifiedCrop}. ${result.symptoms.join(' ')} ${result.uncertaintyNote} Recommendations: ${result.recommendations.join(' ')}`
    : '';

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-xl p-5">
        <h1 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
          AI Crop Health &amp; Symptom Scanner
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Capture a close-up leaf or plant photo or upload an image. Unclear photos receive an honest uncertainty flag rather than a guessed diagnosis.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Field Context
              </label>
              <select
                value={fieldId}
                onChange={(e) => setFieldId(e.target.value ? Number(e.target.value) : '')}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-700 rounded-lg"
              >
                <option value="">General (no field)</option>
                {fields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Expected Crop
              </label>
              <select
                value={cropId}
                onChange={(e) => setCropId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-700 rounded-lg"
              >
                {CROP_DATABASE.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-2">
            <label className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-medium bg-stone-100 dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-lg cursor-pointer hover:bg-stone-200">
              <Upload className="w-4 h-4" />
              <span>Upload Photo</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
            <button
              type="button"
              onClick={cameraOpen ? stopCamera : startCamera}
              className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-medium bg-stone-100 dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-lg hover:bg-stone-200"
            >
              {cameraOpen ? <X className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
              <span>{cameraOpen ? 'Close Camera' : 'Use Camera'}</span>
            </button>
          </div>

          {cameraOpen && (
            <div className="space-y-2">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full rounded-lg border border-stone-200 dark:border-slate-700 bg-black aspect-video object-cover"
              />
              <button
                type="button"
                onClick={captureSnapshot}
                className="w-full py-2 bg-emerald-700 text-white text-xs font-medium rounded-lg hover:bg-emerald-800"
              >
                Capture Leaf Photo
              </button>
            </div>
          )}

          {previewDataUrl ? (
            <div className="border border-stone-200 dark:border-slate-700 rounded-xl overflow-hidden bg-stone-100 dark:bg-slate-950">
              <img
                src={previewDataUrl}
                alt="Crop sample preview"
                className="w-full max-h-72 object-contain"
              />
            </div>
          ) : (
            <div className="h-52 border border-dashed border-stone-300 dark:border-slate-700 rounded-xl flex flex-col items-center justify-center text-xs text-slate-500 p-4 text-center">
              <ScanLine className="w-8 h-8 text-slate-400 mb-2" />
              <span>Upload a close-up photo of affected leaves, stems, or panicles (JPEG/PNG/WEBP, max 8 MB).</span>
            </div>
          )}

          {errorMsg && <p className="text-xs text-red-600">{errorMsg}</p>}

          <button
            type="button"
            onClick={handleAnalyze}
            disabled={analyzing || !previewDataUrl}
            className="w-full py-2.5 px-4 bg-emerald-700 text-white text-sm font-medium rounded-lg hover:bg-emerald-800 disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanLine className="w-4 h-4" />}
            <span>{analyzing ? 'Analyzing Crop Image...' : 'Analyze Crop Symptoms'}</span>
          </button>
        </div>

        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
          {!result ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-12 text-sm text-slate-500 space-y-2">
              <AlertCircle className="w-8 h-8 text-slate-400" />
              <p>Submit a crop image to receive symptom screening, possible pest/disease matches, and preventive guidance.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-stone-200 dark:border-slate-800">
                <div>
                  <p className="text-xs text-slate-500">
                    Identified Crop · Image Quality: <strong>{result.imageQuality}</strong> · Provider:{' '}
                    {result.isFallback ? 'Rule-based fallback' : result.provider}
                  </p>
                  <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                    {result.identifiedCrop}
                  </h2>
                </div>
                <AudioPlayerButton
                  text={spokenSummary}
                  languageCode={languageCode}
                  label="Listen to Scan Result"
                  compact
                />
              </div>

              <div>
                <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Visible Symptoms Observed
                </h3>
                <ul className="list-disc pl-5 text-sm text-slate-700 dark:text-slate-300 space-y-1">
                  {result.symptoms.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Possible Issues &amp; Confidence
                </h3>
                <div className="space-y-2">
                  {result.possibleIssues.map((iss, i) => (
                    <div
                      key={i}
                      className="p-3 bg-stone-50 dark:bg-slate-800/60 border border-stone-200 dark:border-slate-700 rounded-lg"
                    >
                      <div className="flex items-center justify-between text-sm font-medium text-slate-900 dark:text-white">
                        <span>{iss.name}</span>
                        <span className="text-xs font-mono text-amber-700 dark:text-amber-400">
                          Likelihood: {iss.likelihood}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{iss.reasoning}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg text-xs text-amber-900 dark:text-amber-200">
                <strong>Uncertainty &amp; Verification:</strong> {result.uncertaintyNote}
              </div>

              <div>
                <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Recommended Next Steps
                </h3>
                <ul className="list-disc pl-5 text-sm text-slate-700 dark:text-slate-300 space-y-1">
                  {result.recommendations.map((rec, i) => (
                    <li key={i}>{rec}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
