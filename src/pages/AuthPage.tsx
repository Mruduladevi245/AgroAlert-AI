import React, { useEffect, useState } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import {
  CloudRain,
  Droplets,
  Eye,
  EyeOff,
  Globe2,
  Languages,
  Loader2,
  Radio,
  Satellite,
  ScanFace,
  ShieldCheck,
  Sprout,
  Volume2,
} from 'lucide-react';
import { CROP_DATABASE } from '../../shared/crops.ts';
import { SUPPORTED_LANGUAGES } from '../../shared/languages.ts';
import { LocationPicker, type SelectedLocationValue } from '../components/LocationPicker.tsx';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, setStoredToken } from '../services/api.ts';

export function AuthPage() {
  const { languageCode, setLanguageCode, refreshSession } = useApp();
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');

  // Login state
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Register state
  const [fullName, setFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [farmName, setFarmName] = useState('');
  const [fieldName, setFieldName] = useState('Main Field');
  const [cropId, setCropId] = useState('rice');
  const [location, setLocation] = useState<SelectedLocationValue>({
    country: '',
    stateProvince: '',
    district: '',
    villageCity: '',
    postalCode: '',
    latitude: NaN,
    longitude: NaN,
    timezone: 'auto',
  });

  // Forgot password state
  const [recoveryIdentifier, setRecoveryIdentifier] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [recoveryStep, setRecoveryStep] = useState<'request' | 'verify'>('request');
  const [demoCodeNotice, setDemoCodeNotice] = useState('');

  // Status & WebAuthn capability
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [webAuthnSupport, setWebAuthnSupport] = useState<{
    supported: boolean;
    reason: string;
  }>({ supported: false, reason: 'Checking device biometric support...' });
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  useEffect(() => {
    let active = true;
    async function checkPasskeySupport() {
      if (!window.isSecureContext || typeof window.PublicKeyCredential === 'undefined') {
        if (active) {
          setWebAuthnSupport({
            supported: false,
            reason: 'Passkey Face Unlock requires HTTPS and a WebAuthn-capable browser.',
          });
        }
        return;
      }
      const inIframe = window.self !== window.top;
      try {
        const available = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        if (!active) return;
        if (!available) {
          setWebAuthnSupport({
            supported: false,
            reason: 'No platform biometric authenticator detected on this device. Use password login.',
          });
        } else if (inIframe) {
          setWebAuthnSupport({
            supported: false,
            reason:
              'Embedded preview iframe restricts WebAuthn biometric prompts. Open directly in browser tab or use password login.',
          });
        } else {
          setWebAuthnSupport({
            supported: true,
            reason: 'Platform biometric passkey ready for enrolled accounts.',
          });
        }
      } catch {
        if (active) {
          setWebAuthnSupport({
            supported: false,
            reason: 'Biometric capability check unavailable in this context. Use password login.',
          });
        }
      }
    }
    checkPasskeySupport();
    return () => {
      active = false;
    };
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setInfoMsg('');
    try {
      const res = await apiRequest<{ token: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password, rememberMe }),
      });
      if (res.token) setStoredToken(res.token);
      await refreshSession();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDemoLogin() {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await apiRequest<{ token: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          identifier: 'demo@agroalert.ai',
          password: 'AgroAlert2026!',
          rememberMe: true,
        }),
      });
      if (res.token) setStoredToken(res.token);
      await refreshSession();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Demo sign in failed.');
    } finally {
      setLoading(false);
    }
  }

  async function handleFaceUnlock() {
    if (!webAuthnSupport.supported) {
      setErrorMsg(webAuthnSupport.reason);
      return;
    }
    if (!identifier.trim()) {
      setErrorMsg('Enter your registered email or phone first to locate your passkey.');
      return;
    }
    setLoading(true);
    setErrorMsg('');
    try {
      const options = await apiRequest<Parameters<typeof startAuthentication>[0]['optionsJSON']>(
        '/api/auth/webauthn/login-options',
        {
          method: 'POST',
          body: JSON.stringify({ identifier }),
        }
      );
      const authResp = await startAuthentication({ optionsJSON: options });
      const verified = await apiRequest<{ token: string }>('/api/auth/webauthn/login-verify', {
        method: 'POST',
        body: JSON.stringify({ identifier, response: authResp }),
      });
      if (verified.token) setStoredToken(verified.token);
      await refreshSession();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Face unlock cancelled or unavailable.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    try {
      const payload: Record<string, unknown> = {
        fullName,
        email: regEmail || undefined,
        phone: regPhone || undefined,
        password: regPassword,
        preferredLanguage: languageCode,
        country: location.country,
        stateRegion: location.stateProvince,
        district: location.district,
        villageCity: location.villageCity,
        farmName,
        fieldName,
        cropId,
        growthStage: 'vegetative',
      };
      if (Number.isFinite(location.latitude) && Number.isFinite(location.longitude)) {
        payload.latitude = location.latitude;
        payload.longitude = location.longitude;
        payload.timezone = location.timezone;
      }
      const res = await apiRequest<{ token: string }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (res.token) setStoredToken(res.token);
      await refreshSession();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setInfoMsg('');
    try {
      if (recoveryStep === 'request') {
        const res = await apiRequest<{ message: string; demoVerificationCode?: string }>(
          '/api/auth/forgot-password',
          {
            method: 'POST',
            body: JSON.stringify({ identifier: recoveryIdentifier }),
          }
        );
        setInfoMsg(res.message);
        if (res.demoVerificationCode) {
          setDemoCodeNotice(res.demoVerificationCode);
        }
        setRecoveryStep('verify');
      } else {
        const res = await apiRequest<{ message: string }>('/api/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({
            identifier: recoveryIdentifier,
            code: recoveryCode,
            newPassword,
          }),
        });
        setInfoMsg(res.message);
        setMode('login');
        setIdentifier(recoveryIdentifier);
        setRecoveryStep('request');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Password recovery failed.');
    } finally {
      setLoading(false);
    }
  }

  const features = [
    {
      icon: CloudRain,
      title: 'AI Weather Intelligence',
      desc: 'Hyperlocal Open-Meteo telemetry calibrated to exact field coordinates.',
    },
    {
      icon: Sprout,
      title: 'Smart Crop Protection',
      desc: 'Stage-specific risk thresholds and AI leaf symptom vision scanning.',
    },
    {
      icon: Volume2,
      title: 'Multilingual Voice Alerts',
      desc: 'Spoken questions and genuine audio warnings across 12+ languages.',
    },
    {
      icon: Globe2,
      title: 'Global Agricultural Monitoring',
      desc: 'Manage multiple farms and fields across any country or timezone.',
    },
  ];

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-12 bg-stone-50 dark:bg-slate-950">
      {/* Left Hero Panel */}
      <div className="lg:col-span-6 xl:col-span-7 relative overflow-hidden flex flex-col justify-between min-h-[420px] lg:min-h-screen bg-emerald-950">
        {!heroImgFailed ? (
          <img
            src="/src/assets/images/login_sunrise_farm_1795075353673.jpg"
            alt="Farmer surveying green irrigated fields at sunrise"
            referrerPolicy="no-referrer"
            onError={() => setHeroImgFailed(true)}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-900 via-emerald-950 to-slate-950" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/55 to-slate-950/40" />

        {/* Top Branding & Agricultural Visual Telemetry Accents */}
        <div className="relative z-10 p-6 sm:p-10 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-600/90 backdrop-blur-sm flex items-center justify-center text-white border border-emerald-400/30">
              <Sprout className="w-5 h-5" />
            </div>
            <span className="font-display text-xl font-bold tracking-tight text-white">
              AgroAlert AI
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs text-stone-200/90">
            <span className="inline-flex items-center gap-1.5">
              <Satellite className="w-3.5 h-3.5 text-emerald-300" />
              <span>Satellite &amp; Forecast</span>
            </span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-amber-300" />
              <span>Drone &amp; Vision</span>
            </span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1.5">
              <Droplets className="w-3.5 h-3.5 text-sky-300" />
              <span>Field Water</span>
            </span>
          </div>
        </div>

        {/* Bottom Tagline & Four Feature Highlights */}
        <div className="relative z-10 p-6 sm:p-10 space-y-6">
          <div className="max-w-xl space-y-3">
            <h1 className="font-display text-3xl sm:text-4xl xl:text-5xl font-semibold text-white leading-tight [text-wrap:balance]">
              Protecting Every Harvest with Intelligent Weather Insights.
            </h1>
            <p className="text-sm sm:text-base text-stone-200 leading-relaxed max-w-lg">
              Monitor live field weather, manual standing-water depth, crop disease symptoms, and emergency multilingual voice alerts anywhere in the world.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 max-w-2xl">
            {features.map((feat) => {
              const Icon = feat.icon;
              return (
                <div
                  key={feat.title}
                  className="bg-slate-950/60 backdrop-blur-md border border-white/15 rounded-xl p-4 flex items-start gap-3"
                >
                  <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-300 shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-white">{feat.title}</h2>
                    <p className="text-xs text-stone-300 mt-0.5 leading-relaxed">{feat.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right Glassmorphism Authentication Card */}
      <div className="lg:col-span-6 xl:col-span-5 flex items-center justify-center p-6 sm:p-10 overflow-y-auto">
        <div className="w-full max-w-lg bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-stone-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
          {/* Top Bar inside Auth Card: Language Selector + Mode Switch */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center p-1 bg-stone-100 dark:bg-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setErrorMsg('');
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  mode === 'login'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setErrorMsg('');
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  mode === 'register'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Register
              </button>
            </div>

            <div className="inline-flex items-center gap-1.5">
              <Languages className="w-4 h-4 text-emerald-700" />
              <select
                aria-label="Preferred language"
                value={languageCode}
                onChange={(e) => setLanguageCode(e.target.value)}
                className="text-xs px-2.5 py-1.5 bg-stone-50 dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-lg"
              >
                {SUPPORTED_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.nativeLabel} ({l.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {errorMsg && (
            <div className="px-3.5 py-2.5 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg">
              {errorMsg}
            </div>
          )}
          {infoMsg && (
            <div className="px-3.5 py-2.5 text-xs text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 rounded-lg">
              {infoMsg}
            </div>
          )}

          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <h2 className="font-display text-2xl font-semibold text-slate-900 dark:text-white">
                  Farmer Sign In
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Access your global farms, weather risks, water logs, and voice agronomist.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Email or Phone Number
                </label>
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="farmer@example.com or +919876543210"
                  className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full pl-3.5 pr-10 py-2.5 text-sm bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
                <label className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="rounded border-stone-300 text-emerald-700 focus:ring-emerald-600"
                  />
                  <span>Remember me</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setMode('forgot');
                    setRecoveryIdentifier(identifier);
                    setErrorMsg('');
                  }}
                  className="text-emerald-700 dark:text-emerald-400 font-medium hover:underline"
                >
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                <span>Sign In</span>
              </button>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleFaceUnlock}
                  disabled={loading || !webAuthnSupport.supported}
                  title={webAuthnSupport.reason}
                  className="py-2 px-3 border border-stone-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-stone-50 dark:hover:bg-slate-800 disabled:opacity-50 inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <ScanFace className="w-4 h-4 text-emerald-700" />
                  <span>Face Unlock (Passkey)</span>
                </button>

                <button
                  type="button"
                  onClick={handleDemoLogin}
                  disabled={loading}
                  className="py-2 px-3 bg-stone-100 dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-800 dark:text-slate-100 hover:bg-stone-200 dark:hover:bg-slate-700 inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <span>Demo Farmer Account</span>
                </button>
              </div>

              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Biometric Passkey Status: {webAuthnSupport.reason}
              </p>
            </form>
          )}

          {mode === 'register' && (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <h2 className="font-display text-2xl font-semibold text-slate-900 dark:text-white">
                  Register Global Farmer Profile
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Supported worldwide via Open-Meteo geocoding, GPS, or manual coordinates.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g., Ramesh Patil"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Farm Name
                  </label>
                  <input
                    type="text"
                    value={farmName}
                    onChange={(e) => setFarmName(e.target.value)}
                    placeholder="e.g., Green Valley Farm"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="farmer@domain.com"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Phone (for SMS alerts)
                  </label>
                  <input
                    type="tel"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    placeholder="+919876543210"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Password (minimum 6 characters)
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div className="pt-2 border-t border-stone-200 dark:border-slate-800 space-y-2.5">
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Primary Field Location (Any Country / Village / Coordinates)
                </p>
                <LocationPicker value={location} onChange={setLocation} compact />
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      First Field Name
                    </label>
                    <input
                      type="text"
                      value={fieldName}
                      onChange={(e) => setFieldName(e.target.value)}
                      className="w-full px-3 py-1.5 text-sm bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Primary Crop
                    </label>
                    <select
                      value={cropId}
                      onChange={(e) => setCropId(e.target.value)}
                      className="w-full px-3 py-1.5 text-sm bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-700 rounded-lg"
                    >
                      {CROP_DATABASE.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Create Farmer Account</span>
              </button>
            </form>
          )}

          {mode === 'forgot' && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <h2 className="font-display text-2xl font-semibold text-slate-900 dark:text-white">
                  Password Recovery
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Request a one-time recovery code to reset your AgroAlert AI password.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Registered Email or Phone
                </label>
                <input
                  type="text"
                  required
                  value={recoveryIdentifier}
                  onChange={(e) => setRecoveryIdentifier(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              {demoCodeNotice && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-900 dark:text-amber-200">
                  Local Demo Verification Code: <strong className="font-mono">{demoCodeNotice}</strong>
                </div>
              )}

              {recoveryStep === 'verify' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Verification Code
                    </label>
                    <input
                      type="text"
                      required
                      value={recoveryCode}
                      onChange={(e) => setRecoveryCode(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      New Password
                    </label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                </>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium rounded-lg"
                >
                  {recoveryStep === 'request' ? 'Generate Recovery Code' : 'Reset Password'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setRecoveryStep('request');
                  }}
                  className="py-2.5 px-4 border border-stone-200 dark:border-slate-700 rounded-lg text-sm"
                >
                  Back
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
