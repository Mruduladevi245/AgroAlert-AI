import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Droplets, Edit2, Loader2, ShieldAlert } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ALL_GROWTH_STAGES, CROP_DATABASE, getCropById, getStageWaterThreshold, type GrowthStageId } from '../../shared/crops.ts';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest } from '../services/api.ts';
import type { WaterAssessment, WaterMeasurement } from '../types/agro.ts';
import { formatDepthFromCm } from '../utils/units.ts';

export function WaterPage() {
  const { fields, selectedField, selectFieldId, profile, refreshWeatherAndRisk } = useApp();

  const [measurements, setMeasurements] = useState<WaterMeasurement[]>([]);
  const [assessment, setAssessment] = useState<WaterAssessment | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [cropId, setCropId] = useState(selectedField?.crop_id || 'rice');
  const [growthStage, setGrowthStage] = useState<GrowthStageId>(
    (selectedField?.growth_stage as GrowthStageId) || 'vegetative'
  );
  const [depthValue, setDepthValue] = useState('');
  const [unit, setUnit] = useState<'cm' | 'mm' | 'in'>(profile?.depth_unit || 'cm');
  const [measuredAt, setMeasuredAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const displayUnit = profile?.depth_unit || 'cm';

  async function loadWaterData(fieldId: number) {
    setLoading(true);
    try {
      const [hist, assess] = await Promise.all([
        apiRequest<{ measurements: WaterMeasurement[] }>(`/api/water/measurements?fieldId=${fieldId}`),
        apiRequest<{ assessment: WaterAssessment }>(`/api/water/assessment?fieldId=${fieldId}`),
      ]);
      setMeasurements(hist.measurements);
      setAssessment(assess.assessment);
    } catch {
      setMeasurements([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (selectedField) {
      setCropId(selectedField.crop_id);
      setGrowthStage(selectedField.growth_stage as GrowthStageId);
      loadWaterData(selectedField.id);
    }
  }, [selectedField?.id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedField) return;
    setSaving(true);
    setErrorMsg('');
    try {
      const isoTime = new Date(measuredAt).toISOString();
      if (editingId) {
        await apiRequest(`/api/water/measurements/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify({
            cropId,
            growthStage,
            value: Number(depthValue),
            unit,
            measuredAt: isoTime,
            notes,
          }),
        });
      } else {
        await apiRequest('/api/water/measurements', {
          method: 'POST',
          body: JSON.stringify({
            fieldId: selectedField.id,
            cropId,
            growthStage,
            value: Number(depthValue),
            unit,
            measuredAt: isoTime,
            notes,
          }),
        });
      }
      setDepthValue('');
      setNotes('');
      setEditingId(null);
      await loadWaterData(selectedField.id);
      await refreshWeatherAndRisk();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save water measurement.');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(m: WaterMeasurement) {
    setEditingId(m.id);
    setCropId(m.crop_id);
    setGrowthStage(m.growth_stage as GrowthStageId);
    setDepthValue(String(m.original_value));
    setUnit(m.original_unit);
    setMeasuredAt(m.measured_at.slice(0, 16));
    setNotes(m.notes || '');
  }

  const cropMeta = getCropById(cropId);
  const threshold = getStageWaterThreshold(cropId, growthStage);

  const chartData = [...measurements]
    .reverse()
    .map((m) => ({
      time: m.measured_at.slice(5, 16).replace('T', ' '),
      depthCm: Number(m.standing_water_cm.toFixed(2)),
    }));

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
            Manual Field Standing-Water Monitor
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Track manual gauge/standing-water depth (separate from soil moisture) with crop- and stage-specific thresholds. No hardware IoT sensors required.
          </p>
        </div>

        <select
          aria-label="Select field for water monitoring"
          value={selectedField?.id ?? ''}
          onChange={(e) => selectFieldId(Number(e.target.value))}
          className="px-3 py-2 text-sm bg-stone-50 dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-lg"
        >
          {fields.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Manual Entry Form */}
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-5 bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              {editingId ? 'Edit Water Measurement' : 'Record Manual Water Depth'}
            </h2>
            <span className="text-[11px] font-mono text-slate-500">Source: MANUAL</span>
          </div>

          {errorMsg && <p className="text-xs text-red-600">{errorMsg}</p>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Crop
              </label>
              <select
                value={cropId}
                onChange={(e) => {
                  const next = getCropById(e.target.value);
                  setCropId(next.id);
                  if (!next.stages.includes(growthStage)) setGrowthStage(next.stages[0]);
                }}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-700 rounded-lg"
              >
                {CROP_DATABASE.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Growth Stage
              </label>
              <select
                value={growthStage}
                onChange={(e) => setGrowthStage(e.target.value as GrowthStageId)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-700 rounded-lg"
              >
                {cropMeta.stages.map((st) => (
                  <option key={st} value={st}>
                    {ALL_GROWTH_STAGES[st].label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Standing Water Depth
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                required
                value={depthValue}
                onChange={(e) => setDepthValue(e.target.value)}
                placeholder="e.g., 4.5"
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-700 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Unit
              </label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as 'cm' | 'mm' | 'in')}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-700 rounded-lg"
              >
                <option value="cm">Centimetres (cm)</option>
                <option value="mm">Millimetres (mm)</option>
                <option value="in">Inches (in)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Observation Date &amp; Time
            </label>
            <input
              type="datetime-local"
              required
              value={measuredAt}
              onChange={(e) => setMeasuredAt(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-700 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Field Observation Notes
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Measured at lower bund corner after rain"
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-700 rounded-lg"
            />
          </div>

          <div className="p-3 bg-stone-50 dark:bg-slate-800/70 rounded-lg text-xs text-slate-600 dark:text-slate-300 space-y-1">
            <p className="font-semibold text-slate-800 dark:text-slate-100">
              Threshold for {cropMeta.name} ({ALL_GROWTH_STAGES[growthStage].label}):
            </p>
            <p className="font-mono tabular-nums">
              Target standing water: {threshold.minStandingWaterCm}–{threshold.maxStandingWaterCm} cm · Critical excess:{' '}
              {threshold.criticalExcessCm} cm
            </p>
            <p>{threshold.guidance}</p>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving || !selectedField}
              className="flex-1 py-2.5 px-4 bg-emerald-700 text-white text-sm font-medium rounded-lg hover:bg-emerald-800 disabled:opacity-60 inline-flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Droplets className="w-4 h-4" />}
              <span>{editingId ? 'Update Measurement' : 'Save Measurement'}</span>
            </button>
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setDepthValue('');
                  setNotes('');
                }}
                className="px-4 py-2.5 border border-stone-200 dark:border-slate-700 rounded-lg text-sm"
              >
                Cancel
              </button>
            )}
          </div>
        </form>

        {/* Assessment + Trend Chart */}
        <div className="lg:col-span-7 space-y-6">
          {assessment && (
            <div
              className={`border rounded-xl p-5 space-y-2 ${
                assessment.status === 'RED'
                  ? 'bg-red-50/70 dark:bg-red-950/30 border-red-300 dark:border-red-900'
                  : assessment.status === 'ORANGE'
                    ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-300 dark:border-amber-900'
                    : 'bg-emerald-50/60 dark:bg-emerald-950/25 border-emerald-300 dark:border-emerald-900'
              }`}
            >
              <div className="flex items-center gap-2 text-xs font-semibold">
                {assessment.status === 'RED' ? (
                  <ShieldAlert className="w-4 h-4 text-red-700" />
                ) : assessment.status === 'ORANGE' ? (
                  <AlertTriangle className="w-4 h-4 text-amber-700" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                )}
                <span>{assessment.status} · Standing Water Assessment</span>
              </div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">{assessment.headline}</h3>
              <p className="text-xs text-slate-700 dark:text-slate-300">{assessment.guidance}</p>
            </div>
          )}

          <div className="bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Standing Water Depth Trend (cm)
            </h3>
            {loading ? (
              <div className="h-56 flex items-center justify-center text-xs text-slate-500">
                Loading history...
              </div>
            ) : chartData.length > 0 ? (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 16, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <ReferenceLine
                      y={threshold.maxStandingWaterCm}
                      stroke="#d97706"
                      strokeDasharray="4 4"
                      label={{ value: 'Max Optimal', fontSize: 10, fill: '#d97706' }}
                    />
                    <ReferenceLine
                      y={threshold.criticalExcessCm}
                      stroke="#dc2626"
                      strokeDasharray="4 4"
                      label={{ value: 'Excess', fontSize: 10, fill: '#dc2626' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="depthCm"
                      name="Standing Water (cm)"
                      stroke="#0284c7"
                      strokeWidth={2.5}
                      dot={{ r: 3.5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-44 flex items-center justify-center text-xs text-slate-500">
                No manual standing-water readings logged for this field yet.
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-stone-200 dark:border-slate-800">
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                Recorded Water History
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-stone-50 dark:bg-slate-950/60 text-slate-500 border-b border-stone-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2 px-4">Time</th>
                    <th className="py-2 px-4">Crop / Stage</th>
                    <th className="py-2 px-4 text-right">Entered</th>
                    <th className="py-2 px-4 text-right">Standardized</th>
                    <th className="py-2 px-4">Source</th>
                    <th className="py-2 px-4 text-right">Edit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200 dark:divide-slate-800">
                  {measurements.map((m) => (
                    <tr key={m.id}>
                      <td className="py-2 px-4 font-mono tabular-nums">
                        {m.measured_at.slice(0, 16).replace('T', ' ')}
                      </td>
                      <td className="py-2 px-4">
                        {m.crop_id} · {m.growth_stage.replace(/_/g, ' ')}
                      </td>
                      <td className="py-2 px-4 text-right font-mono tabular-nums">
                        {m.original_value} {m.original_unit}
                      </td>
                      <td className="py-2 px-4 text-right font-mono tabular-nums">
                        {formatDepthFromCm(m.standing_water_cm, displayUnit)}
                      </td>
                      <td className="py-2 px-4 font-mono">{m.source}</td>
                      <td className="py-2 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => startEdit(m)}
                          aria-label="Edit measurement"
                          className="p-1 text-slate-500 hover:text-emerald-700"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {measurements.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-500">
                        No entries yet. Record your first measurement on the left.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
