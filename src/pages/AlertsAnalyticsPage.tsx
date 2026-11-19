import React, { useEffect, useState } from 'react';
import { BarChart3, Filter, Loader2 } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AudioPlayerButton } from '../components/AudioPlayerButton.tsx';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest } from '../services/api.ts';

interface AlertRow {
  id: number;
  field_id: number;
  category: string;
  severity: 'GREEN' | 'ORANGE' | 'RED';
  title: string;
  message: string;
  translated_text: string;
  language_code: string;
  data_source: string;
  created_at: string;
}

interface WeatherHistRow {
  id: number;
  temperature_c: number | null;
  rainfall_mm: number | null;
  fetched_at: string;
}

export function AlertsAnalyticsPage() {
  const { fields, languageCode } = useApp();
  const [fieldFilter, setFieldFilter] = useState<string>('');
  const [severityFilter, setSeverityFilter] = useState<string>('');
  const [fromDate, setFromDate] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [weatherHistory, setWeatherHistory] = useState<WeatherHistRow[]>([]);

  async function loadHistory() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (fieldFilter) params.set('fieldId', fieldFilter);
      if (severityFilter) params.set('severity', severityFilter);
      if (fromDate) params.set('from', fromDate);
      const res = await apiRequest<{
        alerts: AlertRow[];
        weatherHistory: WeatherHistRow[];
      }>(`/api/alerts/history?${params.toString()}`);
      setAlerts(res.alerts);
      setWeatherHistory(res.weatherHistory);
    } catch {
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldFilter, severityFilter, fromDate]);

  const weatherTrend = [...weatherHistory]
    .reverse()
    .map((w) => ({
      time: w.fetched_at.slice(5, 16),
      tempC: w.temperature_c ?? 0,
      rainMm: w.rainfall_mm ?? 0,
    }));

  const severityCounts = [
    { level: 'RED (Critical)', count: alerts.filter((a) => a.severity === 'RED').length },
    { level: 'ORANGE (Warning)', count: alerts.filter((a) => a.severity === 'ORANGE').length },
    { level: 'GREEN (Normal)', count: alerts.filter((a) => a.severity === 'GREEN').length },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
            Alert History &amp; Farm Analytics
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Historical weather observations, risk severity logs, and translated voice alert playback.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            aria-label="Filter by field"
            value={fieldFilter}
            onChange={(e) => setFieldFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-stone-50 dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-lg"
          >
            <option value="">All Fields</option>
            {fields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by severity"
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-stone-50 dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-lg"
          >
            <option value="">All Severities</option>
            <option value="RED">RED (Critical)</option>
            <option value="ORANGE">ORANGE (Warning)</option>
            <option value="GREEN">GREEN (Normal)</option>
          </select>

          <input
            type="date"
            aria-label="From date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="px-3 py-1.5 text-xs bg-stone-50 dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-lg"
          />
        </div>
      </div>

      {/* Analytics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Recorded Temperature &amp; Rainfall Logs
            </h2>
            <BarChart3 className="w-4 h-4 text-emerald-700" />
          </div>
          {weatherTrend.length > 0 ? (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weatherTrend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="tempC" name="Temp (°C)" stroke="#dc2626" strokeWidth={2} />
                  <Line type="monotone" dataKey="rainMm" name="Rain (mm)" stroke="#0284c7" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-44 flex items-center justify-center text-xs text-slate-500">
              No weather logs recorded for this filter yet.
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            Alert Frequency by Severity
          </h2>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={severityCounts} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="level" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" name="Alerts" fill="#047857" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Alert History Table */}
      <div className="bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            Saved Agricultural Alerts ({alerts.length})
          </h2>
          {loading && <Loader2 className="w-4 h-4 animate-spin text-emerald-700" />}
        </div>

        <div className="divide-y divide-stone-200 dark:divide-slate-800">
          {alerts.map((a) => {
            const textToSpeak = a.translated_text || a.message;
            const fieldName = fields.find((f) => f.id === a.field_id)?.name || `Field #${a.field_id}`;
            return (
              <div key={a.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={`font-semibold ${
                        a.severity === 'RED'
                          ? 'text-red-700 dark:text-red-400'
                          : a.severity === 'ORANGE'
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-emerald-700 dark:text-emerald-400'
                      }`}
                    >
                      {a.severity}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="font-medium text-slate-800 dark:text-slate-200">{fieldName}</span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-500">{a.category}</span>
                    <span className="text-slate-400">·</span>
                    <span className="font-mono text-slate-500 tabular-nums">{a.created_at}</span>
                  </div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{a.title}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{textToSpeak}</p>
                </div>

                <div className="shrink-0">
                  <AudioPlayerButton
                    text={textToSpeak}
                    languageCode={a.language_code || languageCode}
                    label="Play Audio"
                    compact
                  />
                </div>
              </div>
            );
          })}

          {alerts.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-500">
              No saved alerts match the current filter. Run a field risk analysis from the Dashboard to generate alerts.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
