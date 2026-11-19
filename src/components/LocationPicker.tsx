import React, { useState } from 'react';
import { Compass, Loader2, MapPin, Navigation, Search } from 'lucide-react';
import { apiRequest } from '../services/api.ts';
import type { GeocodedResult } from '../types/agro.ts';

export interface SelectedLocationValue {
  country: string;
  stateProvince: string;
  district: string;
  villageCity: string;
  postalCode: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

interface LocationPickerProps {
  value: SelectedLocationValue;
  onChange: (next: SelectedLocationValue) => void;
  compact?: boolean;
}

export function LocationPicker({ value, onChange, compact = false }: LocationPickerProps) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [results, setResults] = useState<GeocodedResult[]>([]);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  async function handleSearch(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (query.trim().length < 2) {
      setErrorMessage('Enter at least 2 characters (village, city, district, state, country, or postal code).');
      return;
    }
    setSearching(true);
    setErrorMessage('');
    setStatusMessage('');
    try {
      const data = await apiRequest<{ results: GeocodedResult[]; source: string; error?: string }>(
        `/api/location/search?q=${encodeURIComponent(query.trim())}&count=8`
      );
      if (data.error) {
        setErrorMessage(data.error);
        setResults([]);
      } else if (data.results.length === 0) {
        setStatusMessage(`No matching locations found for "${query.trim()}". Try entering coordinates manually below.`);
        setResults([]);
      } else {
        setResults(data.results);
        setStatusMessage(`Found ${data.results.length} matching global locations via ${data.source}.`);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Location search failed.');
    } finally {
      setSearching(false);
    }
  }

  function handleSelectResult(item: GeocodedResult) {
    onChange({
      country: item.country || '',
      stateProvince: item.admin1 || '',
      district: item.admin2 || '',
      villageCity: item.name || '',
      postalCode: item.postcodes?.[0] || '',
      latitude: Number(item.latitude.toFixed(5)),
      longitude: Number(item.longitude.toFixed(5)),
      timezone: item.timezone || 'auto',
    });
    setResults([]);
    setStatusMessage(`Selected: ${item.displayName} (${item.latitude.toFixed(4)}, ${item.longitude.toFixed(4)})`);
    setErrorMessage('');
  }

  function handleDetectGps() {
    if (!navigator.geolocation) {
      setErrorMessage('Browser GPS geolocation is unavailable. Use search or manual coordinates below.');
      return;
    }
    setGpsLoading(true);
    setErrorMessage('');
    setStatusMessage('Requesting device GPS coordinates...');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(5));
        const lon = Number(pos.coords.longitude.toFixed(5));
        try {
          const rev = await apiRequest<{
            country: string;
            stateProvince: string;
            district: string;
            villageCity: string;
            postalCode: string;
            displayName: string;
          }>(`/api/location/reverse-geocode?lat=${lat}&lon=${lon}`);
          onChange({
            country: rev.country || '',
            stateProvince: rev.stateProvince || '',
            district: rev.district || '',
            villageCity: rev.villageCity || '',
            postalCode: rev.postalCode || '',
            latitude: lat,
            longitude: lon,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'auto',
          });
          setStatusMessage(`GPS detected: ${rev.displayName}`);
        } catch {
          onChange({
            ...value,
            latitude: lat,
            longitude: lon,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'auto',
          });
          setStatusMessage(`GPS coordinates set (${lat}, ${lon}).`);
        } finally {
          setGpsLoading(false);
        }
      },
      (err) => {
        setGpsLoading(false);
        if (err.code === err.PERMISSION_DENIED) {
          setErrorMessage('GPS permission denied. Please search by village/city/country or enter coordinates manually.');
        } else {
          setErrorMessage('Unable to acquire GPS fix. Please search or enter coordinates manually.');
        }
        setStatusMessage('');
      },
      { enableHighAccuracy: true, timeout: 9000 }
    );
  }

  async function handleReverseFromManualCoords() {
    if (!Number.isFinite(value.latitude) || !Number.isFinite(value.longitude)) return;
    setSearching(true);
    setErrorMessage('');
    try {
      const rev = await apiRequest<{
        country: string;
        stateProvince: string;
        district: string;
        villageCity: string;
        postalCode: string;
        displayName: string;
      }>(`/api/location/reverse-geocode?lat=${value.latitude}&lon=${value.longitude}`);
      onChange({
        ...value,
        country: rev.country || value.country,
        stateProvince: rev.stateProvince || value.stateProvince,
        district: rev.district || value.district,
        villageCity: rev.villageCity || value.villageCity,
        postalCode: rev.postalCode || value.postalCode,
      });
      setStatusMessage(`Resolved coordinates to: ${rev.displayName}`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to resolve coordinates.');
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSearch();
              }
            }}
            placeholder="Search village, town, city, district, state, country, or ZIP..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-700"
          />
        </div>
        <button
          type="button"
          onClick={() => handleSearch()}
          disabled={searching}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 disabled:opacity-60 whitespace-nowrap shrink-0"
        >
          {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          <span>Search</span>
        </button>
        <button
          type="button"
          onClick={handleDetectGps}
          disabled={gpsLoading}
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-sm font-medium bg-stone-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-stone-200 dark:border-slate-700 rounded-lg hover:bg-stone-200 dark:hover:bg-slate-700 disabled:opacity-60 whitespace-nowrap shrink-0"
        >
          {gpsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
          <span>Use GPS</span>
        </button>
      </div>

      {results.length > 0 && (
        <div className="border border-stone-200 dark:border-slate-700 rounded-lg divide-y divide-stone-200 dark:divide-slate-800 bg-white dark:bg-slate-900 max-h-52 overflow-y-auto">
          {results.map((r) => (
            <button
              key={`${r.id}-${r.latitude}`}
              type="button"
              onClick={() => handleSelectResult(r)}
              className="w-full text-left px-3.5 py-2.5 hover:bg-emerald-50/70 dark:hover:bg-slate-800 flex items-center justify-between gap-3 transition-colors"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                  {r.displayName}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  {r.latitude.toFixed(4)}, {r.longitude.toFixed(4)} · {r.timezone}
                  {r.postcodes?.length ? ` · ${r.postcodes[0]}` : ''}
                </div>
              </div>
              <MapPin className="w-4 h-4 text-emerald-700 shrink-0" />
            </button>
          ))}
        </div>
      )}

      {statusMessage && <p className="text-xs text-emerald-700 dark:text-emerald-400">{statusMessage}</p>}
      {errorMessage && <p className="text-xs text-red-600 dark:text-red-400">{errorMessage}</p>}

      {!compact && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Village / City
            </label>
            <input
              type="text"
              value={value.villageCity}
              onChange={(e) => onChange({ ...value, villageCity: e.target.value })}
              className="w-full px-3 py-1.5 text-sm bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-700 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              District / County
            </label>
            <input
              type="text"
              value={value.district}
              onChange={(e) => onChange({ ...value, district: e.target.value })}
              className="w-full px-3 py-1.5 text-sm bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-700 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              State / Province
            </label>
            <input
              type="text"
              value={value.stateProvince}
              onChange={(e) => onChange({ ...value, stateProvince: e.target.value })}
              className="w-full px-3 py-1.5 text-sm bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-700 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Country
            </label>
            <input
              type="text"
              value={value.country}
              onChange={(e) => onChange({ ...value, country: e.target.value })}
              className="w-full px-3 py-1.5 text-sm bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-700 rounded-lg"
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Latitude (-90 to 90)
          </label>
          <input
            type="number"
            step="0.0001"
            value={Number.isFinite(value.latitude) ? value.latitude : ''}
            onChange={(e) => onChange({ ...value, latitude: parseFloat(e.target.value) })}
            className="w-full px-3 py-1.5 text-sm font-mono tabular-nums bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-700 rounded-lg"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Longitude (-180 to 180)
          </label>
          <input
            type="number"
            step="0.0001"
            value={Number.isFinite(value.longitude) ? value.longitude : ''}
            onChange={(e) => onChange({ ...value, longitude: parseFloat(e.target.value) })}
            className="w-full px-3 py-1.5 text-sm font-mono tabular-nums bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-700 rounded-lg"
          />
        </div>
        <button
          type="button"
          onClick={handleReverseFromManualCoords}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-stone-100 dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-lg hover:bg-stone-200 dark:hover:bg-slate-700 whitespace-nowrap shrink-0 h-[34px]"
        >
          <Compass className="w-3.5 h-3.5" />
          <span>Resolve Coordinates</span>
        </button>
      </div>
    </div>
  );
}
