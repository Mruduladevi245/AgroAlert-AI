import React, { useState } from 'react';
import { CloudRain, Globe2, Loader2, RefreshCw, Sunrise, Sunset, Thermometer, Wind } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { LocationPicker, type SelectedLocationValue } from '../components/LocationPicker.tsx';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest } from '../services/api.ts';
import type { WeatherForecast } from '../types/agro.ts';
import {
  convertTempValue,
  formatLocalTime,
  formatRain,
  formatShortDate,
  formatTemp,
  formatWind,
  windCompassDirection,
} from '../utils/units.ts';

export function WeatherPage() {
  const { selectedField, weather, weatherLoading, refreshWeatherAndRisk, profile } = useApp();

  const [mode, setMode] = useState<'field' | 'explore'>('field');
  const [exploreLoc, setExploreLoc] = useState<SelectedLocationValue>({
    country: 'United Kingdom',
    stateProvince: 'England',
    district: 'Greater London',
    villageCity: 'London',
    postalCode: '',
    latitude: 51.5074,
    longitude: -0.1278,
    timezone: 'Europe/London',
  });
  const [exploreWeather, setExploreWeather] = useState<WeatherForecast | null>(null);
  const [exploreLoading, setExploreLoading] = useState(false);

  const tempUnit = profile?.temp_unit || 'C';
  const rainUnit = profile?.rain_unit || 'mm';
  const windUnit = profile?.wind_unit || 'kmh';

  async function fetchExploreWeather(loc: SelectedLocationValue = exploreLoc) {
    setExploreLoading(true);
    try {
      const w = await apiRequest<WeatherForecast>(
        `/api/weather?lat=${loc.latitude}&lon=${loc.longitude}&timezone=${encodeURIComponent(loc.timezone || 'auto')}`
      );
      setExploreWeather(w);
    } catch (err) {
      setExploreWeather({
        dataAvailable: false,
        source: 'Open-Meteo Weather API',
        latitude: loc.latitude,
        longitude: loc.longitude,
        timezone: 'UTC',
        timezoneAbbreviation: 'UTC',
        lastUpdated: new Date().toISOString(),
        errorMessage: err instanceof Error ? err.message : 'Weather fetch failed',
        current: null,
        hourly: [],
        daily: [],
      });
    } finally {
      setExploreLoading(false);
    }
  }

  const activeWeather = mode === 'field' ? weather : exploreWeather;
  const isLoading = mode === 'field' ? weatherLoading : exploreLoading;

  const hourlyChart =
    activeWeather?.hourly.map((h) => ({
      hour: h.time.slice(11, 16),
      temp: convertTempValue(h.temperatureC, tempUnit),
      rainProb: h.rainProbabilityPercent ?? 0,
      rainMm: h.precipitationMm ?? 0,
    })) ?? [];

  const quickPresets = [
    { label: 'Bengaluru, India', lat: 12.9716, lon: 77.5946, tz: 'Asia/Kolkata', city: 'Bengaluru', country: 'India' },
    { label: 'Holenarasipura, Karnataka', lat: 12.7833, lon: 76.2389, tz: 'Asia/Kolkata', city: 'Holenarasipura', country: 'India' },
    { label: 'Mumbai, India', lat: 19.076, lon: 72.8777, tz: 'Asia/Kolkata', city: 'Mumbai', country: 'India' },
    { label: 'Delhi, India', lat: 28.6139, lon: 77.209, tz: 'Asia/Kolkata', city: 'New Delhi', country: 'India' },
    { label: 'London, UK', lat: 51.5074, lon: -0.1278, tz: 'Europe/London', city: 'London', country: 'United Kingdom' },
    { label: 'New York, USA', lat: 40.7128, lon: -74.006, tz: 'America/New_York', city: 'New York', country: 'United States' },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
            Global Agricultural Weather Monitoring
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Live Open-Meteo telemetry using exact coordinates and local field time zones.
          </p>
        </div>

        <div className="inline-flex items-center p-1 bg-stone-100 dark:bg-slate-800 rounded-lg self-start">
          <button
            type="button"
            onClick={() => setMode('field')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              mode === 'field'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Active Field Weather
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('explore');
              if (!exploreWeather) fetchExploreWeather();
            }}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              mode === 'explore'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Any Global Location
          </button>
        </div>
      </div>

      {mode === 'explore' && (
        <div className="bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
              <Globe2 className="w-4 h-4 text-emerald-700" />
              <span>Global Location &amp; Coordinate Weather Lookup</span>
            </div>
            <button
              type="button"
              onClick={() => fetchExploreWeather()}
              disabled={exploreLoading}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 disabled:opacity-60"
            >
              {exploreLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              <span>Fetch Live Weather</span>
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {quickPresets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  const next: SelectedLocationValue = {
                    country: p.country,
                    stateProvince: '',
                    district: '',
                    villageCity: p.city,
                    postalCode: '',
                    latitude: p.lat,
                    longitude: p.lon,
                    timezone: p.tz,
                  };
                  setExploreLoc(next);
                  fetchExploreWeather(next);
                }}
                className="px-2.5 py-1 text-xs bg-stone-100 dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-md hover:bg-stone-200 dark:hover:bg-slate-700"
              >
                {p.label}
              </button>
            ))}
          </div>

          <LocationPicker value={exploreLoc} onChange={setExploreLoc} compact />
        </div>
      )}

      {isLoading ? (
        <div className="bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-xl p-10 flex items-center justify-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin text-emerald-700" />
          <span>Retrieving live Open-Meteo forecast...</span>
        </div>
      ) : activeWeather?.dataAvailable && activeWeather.current ? (
        <>
          <div className="bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                  {mode === 'field'
                    ? `${selectedField?.name || 'Field'} (${selectedField?.village_city || selectedField?.country || ''})`
                    : [exploreLoc.villageCity, exploreLoc.stateProvince, exploreLoc.country].filter(Boolean).join(', ') ||
                      `${activeWeather.latitude.toFixed(4)}, ${activeWeather.longitude.toFixed(4)}`}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  {activeWeather.latitude.toFixed(4)}, {activeWeather.longitude.toFixed(4)} · Timezone:{' '}
                  {activeWeather.timezone} ({activeWeather.timezoneAbbreviation}) · Source: {activeWeather.source} · Updated:{' '}
                  {formatLocalTime(activeWeather.lastUpdated, activeWeather.timezone)}
                </p>
              </div>
              {mode === 'field' && (
                <button
                  type="button"
                  onClick={() => refreshWeatherAndRisk()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-stone-100 dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-lg hover:bg-stone-200"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Refresh</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4 pt-2 border-t border-stone-200 dark:border-slate-800">
              <div>
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  <Thermometer className="w-3.5 h-3.5" /> Temp
                </p>
                <p className="text-xl font-display font-semibold tabular-nums">
                  {formatTemp(activeWeather.current.temperatureC, tempUnit)}
                </p>
                <p className="text-[11px] text-slate-500">
                  Feels {formatTemp(activeWeather.current.apparentTemperatureC, tempUnit)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Humidity</p>
                <p className="text-xl font-display font-semibold tabular-nums">
                  {activeWeather.current.humidityPercent ?? '--'}%
                </p>
                <p className="text-[11px] text-slate-500">{activeWeather.current.weatherLabel}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  <CloudRain className="w-3.5 h-3.5" /> Rain
                </p>
                <p className="text-xl font-display font-semibold tabular-nums">
                  {formatRain(activeWeather.current.precipitationMm, rainUnit)}
                </p>
                <p className="text-[11px] text-slate-500">
                  Prob: {activeWeather.hourly[0]?.rainProbabilityPercent ?? 0}%
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  <Wind className="w-3.5 h-3.5" /> Wind
                </p>
                <p className="text-xl font-display font-semibold tabular-nums">
                  {formatWind(activeWeather.current.windSpeedKmh, windUnit)}
                </p>
                <p className="text-[11px] text-slate-500">
                  {windCompassDirection(activeWeather.current.windDirectionDeg)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Surface Soil Moisture</p>
                <p className="text-xl font-display font-semibold tabular-nums">
                  {activeWeather.current.soilMoistureSurface !== null
                    ? `${(activeWeather.current.soilMoistureSurface * 100).toFixed(0)}%`
                    : 'N/A'}
                </p>
                <p className="text-[11px] text-slate-500">0–1 cm model est.</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Sunrise / Sunset</p>
                <p className="text-xs font-mono tabular-nums mt-1 flex items-center gap-1">
                  <Sunrise className="w-3.5 h-3.5 text-amber-500" />
                  {formatLocalTime(activeWeather.daily[0]?.sunrise, activeWeather.timezone)}
                </p>
                <p className="text-xs font-mono tabular-nums flex items-center gap-1">
                  <Sunset className="w-3.5 h-3.5 text-orange-500" />
                  {formatLocalTime(activeWeather.daily[0]?.sunset, activeWeather.timezone)}
                </p>
              </div>
            </div>
          </div>

          {/* 24-Hour Hourly Trend */}
          <div className="bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              24-Hour Temperature &amp; Rain Probability
            </h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={hourlyChart} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="temp"
                    name={`Temp (°${tempUnit})`}
                    stroke="#047857"
                    fill="#10b981"
                    fillOpacity={0.18}
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="rainProb"
                    name="Rain Prob (%)"
                    stroke="#0284c7"
                    fill="#38bdf8"
                    fillOpacity={0.15}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 7-Day Daily Table */}
          <div className="bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-stone-200 dark:border-slate-800">
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                7-Day Agricultural Forecast
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-stone-50 dark:bg-slate-950/60 text-xs text-slate-500 border-b border-stone-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4 font-medium">Date</th>
                    <th className="py-2.5 px-4 font-medium">Condition</th>
                    <th className="py-2.5 px-4 font-medium text-right">Min / Max</th>
                    <th className="py-2.5 px-4 font-medium text-right">Rain Sum</th>
                    <th className="py-2.5 px-4 font-medium text-right">Rain Prob</th>
                    <th className="py-2.5 px-4 font-medium text-right">Max Wind</th>
                    <th className="py-2.5 px-4 font-medium text-right">ET₀ Evap</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200 dark:divide-slate-800">
                  {activeWeather.daily.map((d) => (
                    <tr key={d.date} className="hover:bg-stone-50/70 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-4 font-medium">{formatShortDate(d.date)}</td>
                      <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">{d.weatherLabel}</td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                        {formatTemp(d.tempMinC, tempUnit)} / {formatTemp(d.tempMaxC, tempUnit)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                        {formatRain(d.precipitationSumMm, rainUnit)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                        {d.rainProbabilityMaxPercent ?? 0}%
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                        {formatWind(d.windSpeedMaxKmh, windUnit)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                        {d.et0EvapotranspirationMm !== null ? `${d.et0EvapotranspirationMm.toFixed(1)} mm` : '--'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl p-6 text-sm text-amber-900 dark:text-amber-200">
          <p className="font-semibold">Weather Data Unavailable</p>
          <p className="text-xs mt-1">
            {activeWeather?.errorMessage ||
              'Could not retrieve Open-Meteo weather data for the selected coordinates. No synthetic weather was substituted.'}
          </p>
        </div>
      )}
    </div>
  );
}
