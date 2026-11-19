import React, { useEffect, useState } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import { CheckCircle2, Loader2, MessageSquare, Save, ScanFace, Shield } from 'lucide-react';
import { SUPPORTED_LANGUAGES } from '../../shared/languages.ts';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest } from '../services/api.ts';

interface NotificationRow {
  id: number;
  recipient: string;
  language_code: string;
  message_text: string;
  status: string;
  mode: string;
  created_at: string;
}

export function ProfileSettingsPage() {
  const { user, profile, languageCode, setLanguageCode, languageCapabilities, refreshSession } = useApp();

  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [country, setCountry] = useState(profile?.country || '');
  const [stateRegion, setStateRegion] = useState(profile?.state_region || '');
  const [district, setDistrict] = useState(profile?.district || '');
  const [villageCity, setVillageCity] = useState(profile?.village_city || '');
  const [tempUnit, setTempUnit] = useState<'C' | 'F'>(profile?.temp_unit || 'C');
  const [rainUnit, setRainUnit] = useState<'mm' | 'cm' | 'in'>(profile?.rain_unit || 'mm');
  const [areaUnit, setAreaUnit] = useState<'hectares' | 'acres'>(profile?.area_unit || 'hectares');
  const [windUnit, setWindUnit] = useState<'kmh' | 'mph' | 'ms'>(profile?.wind_unit || 'kmh');
  const [depthUnit, setDepthUnit] = useState<'cm' | 'mm' | 'in'>(profile?.depth_unit || 'cm');
  const [smsConsent, setSmsConsent] = useState(profile?.sms_consent === 1);
  const [autoVoiceAlerts, setAutoVoiceAlerts] = useState(profile?.auto_voice_alerts === 1);

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // SMS History & Test
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [twilioConfigured, setTwilioConfigured] = useState(false);
  const [testSmsMessage, setTestSmsMessage] = useState(
    'AgroAlert AI weather advisory: Check field drainage ahead of rainfall forecast.'
  );
  const [smsSending, setSmsSending] = useState(false);
  const [smsFeedback, setSmsFeedback] = useState('');

  // WebAuthn Passkey status
  const [passkeyMsg, setPasskeyMsg] = useState('');
  const [passkeyEnrolling, setPasskeyEnrolling] = useState(false);

  async function loadNotifications() {
    try {
      const res = await apiRequest<{ twilioConfigured: boolean; notifications: NotificationRow[] }>(
        '/api/notifications/history'
      );
      setTwilioConfigured(res.twilioConfigured);
      setNotifications(res.notifications);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    loadNotifications();
  }, []);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveMsg('');
    setErrorMsg('');
    try {
      await apiRequest('/api/farmer/profile', {
        method: 'PUT',
        body: JSON.stringify({
          fullName,
          phone,
          country,
          stateRegion,
          district,
          villageCity,
          preferredLanguage: languageCode,
          tempUnit,
          rainUnit,
          areaUnit,
          windUnit,
          depthUnit,
          smsConsent,
          autoVoiceAlerts,
        }),
      });
      await refreshSession();
      setSaveMsg('Farmer profile, units, and preferences saved.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save profile.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSendTestSms(e: React.FormEvent) {
    e.preventDefault();
    setSmsSending(true);
    setSmsFeedback('');
    try {
      const res = await apiRequest<{ status: string; mode: string; translatedMessage: string }>(
        '/api/notifications/send',
        {
          method: 'POST',
          body: JSON.stringify({
            recipientPhone: phone,
            languageCode,
            message: testSmsMessage,
            consentConfirmed: smsConsent,
          }),
        }
      );
      setSmsFeedback(
        res.mode === 'DEMO'
          ? `Demo Mode (${res.status}): "${res.translatedMessage}"`
          : `Sent (${res.status}): "${res.translatedMessage}"`
      );
      await loadNotifications();
    } catch (err) {
      setSmsFeedback(err instanceof Error ? err.message : 'SMS send failed.');
    } finally {
      setSmsSending(false);
    }
  }

  async function handleEnrollPasskey() {
    if (!window.isSecureContext || typeof window.PublicKeyCredential === 'undefined') {
      setPasskeyMsg('WebAuthn Passkey enrollment requires HTTPS and a compatible browser.');
      return;
    }
    if (window.self !== window.top) {
      setPasskeyMsg(
        'Embedded iframe preview restricts WebAuthn biometric enrollment. Open this app directly in a top-level browser tab to register Face Unlock.'
      );
      return;
    }
    setPasskeyEnrolling(true);
    setPasskeyMsg('');
    try {
      const options = await apiRequest<Parameters<typeof startRegistration>[0]['optionsJSON']>(
        '/api/auth/webauthn/register-options',
        { method: 'POST', body: JSON.stringify({}) }
      );
      const attResp = await startRegistration({ optionsJSON: options });
      await apiRequest('/api/auth/webauthn/register-verify', {
        method: 'POST',
        body: JSON.stringify({ response: attResp, deviceLabel: 'Farmer Device Biometric' }),
      });
      setPasskeyMsg('Biometric Face Unlock / Passkey enrolled and verified!');
    } catch (err) {
      setPasskeyMsg(err instanceof Error ? err.message : 'Passkey registration cancelled or unavailable.');
    } finally {
      setPasskeyEnrolling(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-xl p-5">
        <h1 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
          Farmer Profile, Regional Units &amp; SMS Alerts
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Configure local measurement units, preferred voice language, biometric Face Unlock, and SMS notification consent.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form
          onSubmit={handleSaveProfile}
          className="lg:col-span-7 bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-xl p-6 space-y-5"
        >
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            Profile &amp; Measurement Preferences
          </h2>

          {saveMsg && (
            <div className="p-3 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>{saveMsg}</span>
            </div>
          )}
          {errorMsg && (
            <div className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">{errorMsg}</div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Full Name
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-700 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Phone Number (with country code)
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+919876543210"
                className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-700 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Village / City
              </label>
              <input
                type="text"
                value={villageCity}
                onChange={(e) => setVillageCity(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-700 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                District
              </label>
              <input
                type="text"
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-700 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                State / Region
              </label>
              <input
                type="text"
                value={stateRegion}
                onChange={(e) => setStateRegion(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-700 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Country
              </label>
              <input
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-700 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 border-t border-stone-200 dark:border-slate-800">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Language
              </label>
              <select
                value={languageCode}
                onChange={(e) => setLanguageCode(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-700 rounded-lg"
              >
                {SUPPORTED_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label} ({l.nativeLabel})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Temperature
              </label>
              <select
                value={tempUnit}
                onChange={(e) => setTempUnit(e.target.value as 'C' | 'F')}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-700 rounded-lg"
              >
                <option value="C">Celsius (°C)</option>
                <option value="F">Fahrenheit (°F)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Rainfall
              </label>
              <select
                value={rainUnit}
                onChange={(e) => setRainUnit(e.target.value as 'mm' | 'cm' | 'in')}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-700 rounded-lg"
              >
                <option value="mm">Millimetres (mm)</option>
                <option value="cm">Centimetres (cm)</option>
                <option value="in">Inches (in)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Standing Water Depth
              </label>
              <select
                value={depthUnit}
                onChange={(e) => setDepthUnit(e.target.value as 'cm' | 'mm' | 'in')}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-700 rounded-lg"
              >
                <option value="cm">Centimetres (cm)</option>
                <option value="mm">Millimetres (mm)</option>
                <option value="in">Inches (in)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Wind Speed
              </label>
              <select
                value={windUnit}
                onChange={(e) => setWindUnit(e.target.value as 'kmh' | 'mph' | 'ms')}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-700 rounded-lg"
              >
                <option value="kmh">km/h</option>
                <option value="mph">mph</option>
                <option value="ms">m/s</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Field Area
              </label>
              <select
                value={areaUnit}
                onChange={(e) => setAreaUnit(e.target.value as 'hectares' | 'acres')}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-700 rounded-lg"
              >
                <option value="hectares">Hectares</option>
                <option value="acres">Acres</option>
              </select>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={smsConsent}
                onChange={(e) => setSmsConsent(e.target.checked)}
                className="rounded border-stone-300 text-emerald-700"
              />
              <span>I consent to receiving translated SMS weather &amp; crop risk alerts on my registered phone.</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={autoVoiceAlerts}
                onChange={(e) => setAutoVoiceAlerts(e.target.checked)}
                className="rounded border-stone-300 text-emerald-700"
              />
              <span>Allow voice prompt shortcuts for critical alerts (never plays without user interaction).</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-700 text-white text-sm font-medium rounded-lg hover:bg-emerald-800 disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>Save Preferences</span>
          </button>
        </form>

        {/* Right 5 cols: WebAuthn + SMS Dispatch */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-base font-display font-semibold text-slate-900 dark:text-white">
              <ScanFace className="w-5 h-5 text-emerald-700" />
              <span>Biometric Face Unlock (WebAuthn)</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Uses device-native WebAuthn passkeys with server-side challenge verification. No raw facial images or biometric templates are ever stored.
            </p>
            <button
              type="button"
              onClick={handleEnrollPasskey}
              disabled={passkeyEnrolling}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium bg-stone-100 dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-lg hover:bg-stone-200"
            >
              <Shield className="w-4 h-4 text-emerald-700" />
              <span>{passkeyEnrolling ? 'Enrolling...' : 'Enroll Device Face / Passkey'}</span>
            </button>
            {passkeyMsg && <p className="text-xs text-slate-700 dark:text-slate-300">{passkeyMsg}</p>}
          </div>

          <form
            onSubmit={handleSendTestSms}
            className="bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-xl p-5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-base font-display font-semibold text-slate-900 dark:text-white">
                <MessageSquare className="w-4 h-4 text-emerald-700" />
                <span>Multilingual SMS Dispatch</span>
              </div>
              <span className="text-[11px] font-mono text-slate-500">
                {twilioConfigured ? 'Twilio Active' : 'Demo Mode'}
              </span>
            </div>
            <textarea
              rows={2}
              value={testSmsMessage}
              onChange={(e) => setTestSmsMessage(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-stone-50 dark:bg-slate-950 border border-stone-200 dark:border-slate-700 rounded-lg"
            />
            <button
              type="submit"
              disabled={smsSending}
              className="px-4 py-2 text-xs font-medium bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 disabled:opacity-60"
            >
              {smsSending ? 'Sending...' : `Send SMS (${languageCode})`}
            </button>
            {smsFeedback && <p className="text-xs text-slate-600 dark:text-slate-300">{smsFeedback}</p>}

            {notifications.length > 0 && (
              <div className="pt-3 border-t border-stone-200 dark:border-slate-800 space-y-2 max-h-48 overflow-y-auto">
                <p className="text-xs font-medium text-slate-500">Recent SMS Log</p>
                {notifications.slice(0, 6).map((n) => (
                  <div key={n.id} className="text-[11px] text-slate-600 dark:text-slate-400">
                    <span className="font-mono font-semibold">{n.status}</span> · {n.language_code} ·{' '}
                    {n.recipient} — {n.message_text.slice(0, 80)}
                  </div>
                ))}
              </div>
            )}
          </form>
        </div>
      </div>

      {/* Real Voice & Language Capability Matrix */}
      <div className="bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-200 dark:border-slate-800">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            Multilingual Voice &amp; Translation Capability Registry
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-stone-50 dark:bg-slate-950/60 text-slate-500 border-b border-stone-200 dark:border-slate-800">
              <tr>
                <th className="py-2.5 px-4">Language</th>
                <th className="py-2.5 px-4">Locale</th>
                <th className="py-2.5 px-4">Translation</th>
                <th className="py-2.5 px-4">Speech Recognition (STT)</th>
                <th className="py-2.5 px-4">Speech Generation (TTS)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 dark:divide-slate-800">
              {languageCapabilities.map((lc) => (
                <tr key={lc.code}>
                  <td className="py-2 px-4 font-medium">
                    {lc.label} ({lc.nativeLabel})
                  </td>
                  <td className="py-2 px-4 font-mono">{lc.code}</td>
                  <td className="py-2 px-4">{lc.translationProvider}</td>
                  <td className="py-2 px-4">{lc.sttProvider}</td>
                  <td className="py-2 px-4">{lc.ttsProvider}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
