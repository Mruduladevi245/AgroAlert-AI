import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  CloudRain,
  Droplets,
  Loader2,
  MapPin,
  MessageSquare,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Sunrise,
  Sunset,
  Thermometer,
  Wind,
} from 'lucide-react';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getCropById } from '../../shared/crops.ts';
import { AudioPlayerButton } from '../components/AudioPlayerButton.tsx';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest } from '../services/api.ts';
import type { WaterAssessment } from '../types/agro.ts';
import {
  convertTempValue,
  formatDepthFromCm,
  formatLocalTime,
  formatRain,
  formatShortDate,
  formatTemp,
  formatWind,
  windCompassDirection,
} from '../utils/units.ts';

interface DashboardOverviewProps {
  onNavigate: (tab: string) => void;
}

export function DashboardOverview({ onNavigate }: DashboardOverviewProps) {
  const {
    profile,
    user,
    fields,
    selectedField,
    selectFieldId,
    weather,
    weatherLoading,
    evaluation,
    evaluationLoading,
    refreshWeatherAndRisk,
    languageCode,
    ui,
    openVoiceWithPrompt,
  } = useApp();

  const [waterInfo, setWaterInfo] = useState<WaterAssessment | null>(null);
  const [recommendation, setRecommendation] = useState<{
    title: string;
    content: string;
    provider: string;
    isFallback: boolean;
  } | null>(null);
  const [recLoading, setRecLoading] = useState(false);
  const [smsStatus, setSmsStatus] = useState('');
  const [smsSending, setSmsSending] = useState(false);

  const tempUnit = profile?.temp_unit || 'C';
  const rainUnit = profile?.rain_unit || 'mm';
  const windUnit = profile?.wind_unit || 'kmh';
  const depthUnit = profile?.depth_unit || 'cm';

  useEffect(() => {
    if (!selectedField?.id) {
      setWaterInfo(null);
      return;
    }
    apiRequest<{ assessment: WaterAssessment }>(`/api/water/assessment?fieldId=${selectedField.id}`)
      .then((res) => setWaterInfo(res.assessment))
      .catch(() => setWaterInfo(null));
  }, [selectedField?.id]);

  async function handleGenerateRecommendation() {
    if (!selectedField) return;
    setRecLoading(true);
    try {
      const res = await apiRequest<{
        title: string;
        content: string;
        provider: string;
        isFallback: boolean;
      }>('/api/recommendations/generate', {
        method: 'POST',
        body: JSON.stringify({ fieldId: selectedField.id, languageCode }),
      });
      setRecommendation(res);
    } catch (err) {
      setRecommendation({
        title: 'Recommendation Unavailable',
        content: err instanceof Error ? err.message : 'Could not generate recommendation.',
        provider: 'error',
        isFallback: true,
      });
    } finally {
      setRecLoading(false);
    }
  }

  async function handleSendAlertSms() {
    if (!selectedField || !evaluation) return;
    if (!user?.phone) {
      setSmsStatus('Add a phone number in Profile & SMS first.');
      return;
    }
    setSmsSending(true);
    setSmsStatus('');
    try {
      const primaryAlert = evaluation.alerts[0];
      const msg = `AgroAlert AI (${selectedField.name}): [${evaluation.overallLevel}] ${primaryAlert?.translatedText || evaluation.summary}`;
      const res = await apiRequest<{ status: string; mode: string; translatedMessage: string }>(
        '/api/notifications/send',
        {
          method: 'POST',
          body: JSON.stringify({
            fieldId: selectedField.id,
            recipientPhone: user.phone,
            languageCode,
            message: msg,
            consentConfirmed: profile?.sms_consent === 1,
          }),
        }
      );
      setSmsStatus(
        res.mode === 'DEMO'
          ? `Demo SMS logged (${res.status}) in ${languageCode}. Configure Twilio credentials for live carrier delivery.`
          : `SMS dispatched (${res.status}).`
      );
    } catch (err) {
      setSmsStatus(err instanceof Error ? err.message : 'SMS send failed.');
    } finally {
      setSmsSending(false);
    }
  }

  if (fields.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-xl p-8 text-center space-y-4">
        <MapPin className="w-10 h-10 text-emerald-700 mx-auto" />
        <h2 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
          Add Your First Farm Field
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
          AgroAlert AI works in any country or region. Add a field with search, GPS, or manual coordinates to unlock live weather, crop risk warnings, and water monitoring.
        </p>
        <button
          type="button"
          onClick={() => onNavigate('fields')}
          className="px-5 py-2.5 bg-emerald-700 text-white text-sm font-medium rounded-lg hover:bg-emerald-800"
        >
          Configure First Field
        </button>
      </div>
    );
  }

  const crop = selectedField ? getCropById(selectedField.crop_id) : null;
  const locationLabel = selectedField
    ? [selectedField.village_city, selectedField.district, selectedField.state_province, selectedField.country]
        .filter(Boolean)
        .join(', ')
    : '';

  const chartData =
    weather?.daily.map((d) => ({
      date: formatShortDate(d.date),
      maxTemp: convertTempValue(d.tempMaxC, tempUnit),
      minTemp: convertTempValue(d.tempMinC, tempUnit),
      rainMm: d.precipitationSumMm ?? 0,
    })) ?? [];

  const severityStyle = (sev: 'GREEN' | 'ORANGE' | 'RED') => {
    if (sev === 'RED') {
      return {
        border: 'border-red-300 dark:border-red-900',
        bg: 'bg-red-50/70 dark:bg-red-950/30',
        text: 'text-red-700 dark:text-red-300',
        label: 'RED · Critical',
        Icon: ShieldAlert,
      };
    }
    if (sev === 'ORANGE') {
      return {
        border: 'border-amber-300 dark:border-amber-900',
        bg: 'bg-amber-50/70 dark:bg-amber-950/30',
        text: 'text-amber-800 dark:text-amber-300',
        label: 'ORANGE · Warning',
        Icon: AlertTriangle,
      };
    }
    return {
      border: 'border-emerald-300 dark:border-emerald-900',
      bg: 'bg-emerald-50/60 dark:bg-emerald-950/25',
      text: 'text-emerald-800 dark:text-emerald-300',
      label: 'GREEN · Normal',
      Icon: CheckCircle2,
    };
  };

  const overallMeta = severityStyle(evaluation?.overallLevel ?? 'GREEN');
  const OverallIcon = overallMeta.Icon;

  const cropBannerImg =
    selectedField?.crop_id === 'wheat'
      ? '/src/assets/images/crop_wheat_field_1795075353385.jpg'
      : '/src/assets/images/crop_rice_paddy_1795075353740.jpg';

  return (
    <div className="space-y-6">
      {/* Welcome & Field Selector Bar */}
      <div className="bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>{ui.welcomeBack}</span>
            <span aria-hidden="true">·</span>
            <span>{profile?.full_name || 'Farmer'}</span>
            {locationLabel && (
              <>
                <span aria-hidden="true">·</span>
                <span>{locationLabel}</span>
              </>
            )}
          </div>
          <h1 className="font-display text-2xl font-semibold text-slate-900 dark:text-white">
            {selectedField?.name} — {crop?.name}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {selectedField?.latitude.toFixed(4)}, {selectedField?.longitude.toFixed(4)} · Stage:{' '}
            {selectedField?.growth_stage.replace(/_/g, ' ')} · Area: {selectedField?.area_value}{' '}
            {selectedField?.area_unit}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            aria-label="Active Field"
            value={selectedField?.id ?? ''}
            onChange={(e) => selectFieldId(Number(e.target.value))}
            className="px-3 py-2 text-sm bg-stone-50 dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-lg"
          >
            {fields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} ({f.village_city || f.country || 'Field'})
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => refreshWeatherAndRisk()}
            disabled={weatherLoading || evaluationLoading}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 disabled:opacity-60 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${weatherLoading ? 'animate-spin' : ''}`} />
            <span>Refresh Analysis</span>
          </button>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>{ui.currentWeather}</span>
            <Thermometer className="w-4 h-4 text-emerald-700" />
          </div>
          {weather?.dataAvailable && weather.current ? (
            <>
              <div className="text-3xl font-display font-semibold tabular-nums text-slate-900 dark:text-white">
                {formatTemp(weather.current.temperatureC, tempUnit)}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {weather.current.weatherLabel} · Feels like{' '}
                {formatTemp(weather.current.apparentTemperatureC, tempUnit)}
              </p>
            </>
          ) : (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {weatherLoading ? 'Fetching Open-Meteo...' : weather?.errorMessage || 'Weather unavailable'}
            </p>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Humidity &amp; Rain</span>
            <CloudRain className="w-4 h-4 text-sky-600" />
          </div>
          {weather?.dataAvailable && weather.current ? (
            <>
              <div className="text-3xl font-display font-semibold tabular-nums text-slate-900 dark:text-white">
                {weather.current.humidityPercent ?? '--'}%
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                Observed rain: {formatRain(weather.current.precipitationMm, rainUnit)} · Next hr prob:{' '}
                {weather.hourly[0]?.rainProbabilityPercent ?? 0}%
              </p>
            </>
          ) : (
            <p className="text-xs text-slate-500">Unavailable</p>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Wind &amp; Solar Window</span>
            <Wind className="w-4 h-4 text-slate-600" />
          </div>
          {weather?.dataAvailable && weather.current ? (
            <>
              <div className="text-2xl font-display font-semibold tabular-nums text-slate-900 dark:text-white">
                {formatWind(weather.current.windSpeedKmh, windUnit)}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 tabular-nums flex items-center gap-2">
                <span>{windCompassDirection(weather.current.windDirectionDeg)}</span>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  <Sunrise className="w-3 h-3" />
                  {formatLocalTime(weather.daily[0]?.sunrise, weather.timezone)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Sunset className="w-3 h-3" />
                  {formatLocalTime(weather.daily[0]?.sunset, weather.timezone)}
                </span>
              </p>
            </>
          ) : (
            <p className="text-xs text-slate-500">Unavailable</p>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>{ui.waterLevel}</span>
            <Droplets className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-2xl font-display font-semibold tabular-nums text-slate-900 dark:text-white">
            {waterInfo?.standingWaterCm !== null && waterInfo?.standingWaterCm !== undefined
              ? formatDepthFromCm(waterInfo.standingWaterCm, depthUnit)
              : 'Not logged'}
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 truncate">
            {waterInfo?.headline || 'Record manual field water depth'}
          </p>
          <button
            type="button"
            onClick={() => onNavigate('water')}
            className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
          >
            Log / View Water Trend
          </button>
        </div>
      </div>

      {/* Main Content Split: Combined Risk Assessment + 7-Day Forecast Chart */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left 7 cols: Risk Alerts & Multilingual Audio */}
        <div className="xl:col-span-7 bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                {ui.cropRisk}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {evaluation?.regionalGuidanceNote || 'Evaluating combined weather, crop stage, and water levels.'}
              </p>
            </div>
            <div
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold ${overallMeta.bg} ${overallMeta.border} ${overallMeta.text}`}
            >
              <OverallIcon className="w-4 h-4" />
              <span>{overallMeta.label}</span>
            </div>
          </div>

          {evaluationLoading ? (
            <div className="py-8 flex items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-700" />
              <span>Evaluating live field risks...</span>
            </div>
          ) : evaluation ? (
            <div className="space-y-4">
              {evaluation.alerts.map((alert, idx) => {
                const st = severityStyle(alert.severity);
                const Icon = st.Icon;
                const spokenText =
                  alert.translatedText && alert.translatedText.trim().length > 0
                    ? alert.translatedText
                    : `${alert.title}. ${alert.evidence} Recommended actions: ${alert.recommendedActions.join(' ')}`;
                return (
                  <div
                    key={`${alert.category}-${idx}`}
                    className={`border ${st.border} ${st.bg} rounded-xl p-4 space-y-2.5`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Icon className={`w-4 h-4 ${st.text}`} />
                        <span className={`text-xs font-semibold ${st.text}`}>{st.label}</span>
                        <span aria-hidden="true" className="text-slate-400">·</span>
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          {alert.category}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        {alert.dataSource}
                      </span>
                    </div>

                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      {alert.title}
                    </h3>
                    <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                      {spokenText}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Uncertainty note: {alert.uncertainty}
                    </p>

                    <div className="pt-1 flex flex-wrap items-center gap-3">
                      <AudioPlayerButton
                        text={spokenText}
                        languageCode={languageCode}
                        label={`${ui.listenAlert} (${languageCode})`}
                        compact
                      />
                      <button
                        type="button"
                        onClick={() => openVoiceWithPrompt(`Explain this alert for ${selectedField?.name}: ${alert.title}`)}
                        className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
                      >
                        Ask Voice Agronomist
                      </button>
                    </div>
                  </div>
                );
              })}

              <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={handleSendAlertSms}
                  disabled={smsSending}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-stone-100 dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-lg hover:bg-stone-200 dark:hover:bg-slate-700"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>{smsSending ? 'Sending...' : ui.sendSms}</span>
                </button>
                {smsStatus && <span className="text-xs text-slate-600 dark:text-slate-400">{smsStatus}</span>}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Click Refresh Analysis to assess risks.</p>
          )}
        </div>

        {/* Right 5 cols: 7-Day Forecast Chart & Field Snapshot */}
        <div className="xl:col-span-5 space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                  {ui.sevenDayForecast}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {weather?.source || 'Open-Meteo'} · {weather?.timezone || 'Local'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('weather')}
                className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
              >
                Hourly &amp; Global
              </button>
            </div>

            {chartData.length > 0 ? (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="temp" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="rain" orientation="right" tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar yAxisId="rain" dataKey="rainMm" name="Rain (mm)" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                    <Line
                      yAxisId="temp"
                      type="monotone"
                      dataKey="maxTemp"
                      name={`Max (°${tempUnit})`}
                      stroke="#dc2626"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                    <Line
                      yAxisId="temp"
                      type="monotone"
                      dataKey="minTemp"
                      name={`Min (°${tempUnit})`}
                      stroke="#059669"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-44 flex items-center justify-center text-xs text-slate-500">
                Forecast chart unavailable for this location.
              </div>
            )}
          </div>

          {/* Crop Visual & Quick Tools */}
          <div className="bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="h-32 relative bg-emerald-950">
              <img
                src={cropBannerImg}
                alt={crop?.name || 'Crop field'}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/25 to-transparent" />
              <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between text-white">
                <div>
                  <p className="text-xs text-stone-200">Active Crop Profile</p>
                  <p className="font-display text-base font-semibold">{crop?.name}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('scanner')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white text-slate-900 rounded-lg hover:bg-stone-100"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>{ui.cropScanner}</span>
                </button>
              </div>
            </div>

            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  AI Field Recommendations
                </h3>
                <button
                  type="button"
                  onClick={handleGenerateRecommendation}
                  disabled={recLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 disabled:opacity-60"
                >
                  {recLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  <span>Generate Today&apos;s Plan</span>
                </button>
              </div>

              {recommendation ? (
                <div className="space-y-2.5 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  <p className="whitespace-pre-wrap">{recommendation.content}</p>
                  <div className="flex items-center justify-between pt-1">
                    <AudioPlayerButton
                      text={recommendation.content}
                      languageCode={languageCode}
                      label="Play Plan"
                      compact
                    />
                    <span className="text-[11px] text-slate-500">
                      {recommendation.isFallback ? 'Rule-based fallback' : recommendation.provider}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Generate tailored agronomic actions grounded in {selectedField?.name}&apos;s weather, water depth, and growth stage.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
