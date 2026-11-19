import React, { useState } from 'react';
import { Check, Edit3, Loader2, MapPin, Plus, Trash2 } from 'lucide-react';
import { ALL_GROWTH_STAGES, CROP_DATABASE, getCropById, type GrowthStageId } from '../../shared/crops.ts';
import { LocationPicker, type SelectedLocationValue } from '../components/LocationPicker.tsx';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest } from '../services/api.ts';
import type { FieldRecord } from '../types/agro.ts';

export function FieldsPage() {
  const { fields, farms, selectedField, selectFieldId, refreshFields, refreshSession } = useApp();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(fields.length === 0);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Farm creation
  const [newFarmName, setNewFarmName] = useState('');
  const [farmSaving, setFarmSaving] = useState(false);

  // Field form state
  const [name, setName] = useState('');
  const [farmId, setFarmId] = useState<string>('');
  const [areaValue, setAreaValue] = useState('2.0');
  const [areaUnit, setAreaUnit] = useState<'hectares' | 'acres'>('hectares');
  const [soilType, setSoilType] = useState('Loam');
  const [irrigationMethod, setIrrigationMethod] = useState('Drip / Sprinkler');
  const [cropId, setCropId] = useState('rice');
  const [growthStage, setGrowthStage] = useState<GrowthStageId>('vegetative');
  const [plantingDate, setPlantingDate] = useState('');
  const [expectedHarvestDate, setExpectedHarvestDate] = useState('');
  const [isPreferred, setIsPreferred] = useState(false);
  const [location, setLocation] = useState<SelectedLocationValue>({
    country: '',
    stateProvince: '',
    district: '',
    villageCity: '',
    postalCode: '',
    latitude: 12.9716,
    longitude: 77.5946,
    timezone: 'auto',
  });

  const cropMeta = getCropById(cropId);

  function startNewField() {
    setEditingId(null);
    setName('');
    setFarmId(farms[0]?.id ? String(farms[0].id) : '');
    setAreaValue('1.5');
    setAreaUnit('hectares');
    setSoilType('Loam');
    setIrrigationMethod('Surface / Drip');
    setCropId('rice');
    setGrowthStage('vegetative');
    setPlantingDate('');
    setExpectedHarvestDate('');
    setIsPreferred(fields.length === 0);
    setLocation({
      country: '',
      stateProvince: '',
      district: '',
      villageCity: '',
      postalCode: '',
      latitude: 12.9716,
      longitude: 77.5946,
      timezone: 'auto',
    });
    setErrorMsg('');
    setShowForm(true);
  }

  function startEditField(f: FieldRecord) {
    setEditingId(f.id);
    setName(f.name);
    setFarmId(f.farm_id ? String(f.farm_id) : '');
    setAreaValue(String(f.area_value));
    setAreaUnit(f.area_unit);
    setSoilType(f.soil_type);
    setIrrigationMethod(f.irrigation_method);
    setCropId(f.crop_id);
    setGrowthStage(f.growth_stage as GrowthStageId);
    setPlantingDate(f.planting_date || '');
    setExpectedHarvestDate(f.expected_harvest_date || '');
    setIsPreferred(f.is_preferred === 1);
    setLocation({
      country: f.country,
      stateProvince: f.state_province,
      district: f.district,
      villageCity: f.village_city,
      postalCode: f.postal_code,
      latitude: f.latitude,
      longitude: f.longitude,
      timezone: f.timezone,
    });
    setErrorMsg('');
    setShowForm(true);
  }

  async function handleAddFarm(e: React.FormEvent) {
    e.preventDefault();
    if (!newFarmName.trim()) return;
    setFarmSaving(true);
    try {
      await apiRequest('/api/farmer/farms', {
        method: 'POST',
        body: JSON.stringify({ name: newFarmName.trim() }),
      });
      setNewFarmName('');
      await refreshSession();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to add farm.');
    } finally {
      setFarmSaving(false);
    }
  }

  async function handleSaveField(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg('');
    try {
      const payload = {
        farmId: farmId ? Number(farmId) : null,
        name,
        country: location.country,
        stateProvince: location.stateProvince,
        district: location.district,
        villageCity: location.villageCity,
        postalCode: location.postalCode,
        latitude: location.latitude,
        longitude: location.longitude,
        timezone: location.timezone,
        areaValue: Number(areaValue),
        areaUnit,
        soilType,
        irrigationMethod,
        cropId,
        growthStage,
        plantingDate,
        expectedHarvestDate,
        isPreferred,
      };
      if (editingId) {
        await apiRequest(`/api/fields/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        const res = await apiRequest<{ field: FieldRecord }>('/api/fields', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        if (res.field?.id) selectFieldId(res.field.id);
      }
      await refreshFields();
      setShowForm(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save field.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteField(id: number) {
    try {
      await apiRequest(`/api/fields/${id}`, { method: 'DELETE' });
      await refreshFields();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to delete field.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
            Farms &amp; Global Fields
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Manage multiple farms and fields across any country, crop, growth stage, and coordinate set.
          </p>
        </div>

        <button
          type="button"
          onClick={startNewField}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 whitespace-nowrap shrink-0 self-start"
        >
          <Plus className="w-4 h-4" />
          <span>Add Field</span>
        </button>
      </div>

      {/* Add Farm Bar */}
      <form
        onSubmit={handleAddFarm}
        className="bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
      >
        <div className="text-xs text-slate-600 dark:text-slate-400">
          Registered Farms ({farms.length}):{' '}
          <span className="font-medium text-slate-900 dark:text-slate-200">
            {farms.map((f) => f.name).join(' · ') || 'None yet'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newFarmName}
            onChange={(e) => setNewFarmName(e.target.value)}
            placeholder="New farm name..."
            className="px-3 py-1.5 text-xs bg-stone-50 dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-lg"
          />
          <button
            type="submit"
            disabled={farmSaving || !newFarmName.trim()}
            className="px-3 py-1.5 text-xs font-medium bg-stone-800 dark:bg-slate-700 text-white rounded-lg disabled:opacity-50 whitespace-nowrap"
          >
            {farmSaving ? 'Adding...' : 'Add Farm'}
          </button>
        </div>
      </form>

      {errorMsg && (
        <div className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">{errorMsg}</div>
      )}

      {showForm && (
        <form
          onSubmit={handleSaveField}
          className="bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-xl p-6 space-y-5"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
              {editingId ? 'Edit Field Details' : 'Register New Field'}
            </h2>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-xs text-slate-500 hover:text-slate-800"
            >
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Field Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., North River Block"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-700 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Parent Farm
              </label>
              <select
                value={farmId}
                onChange={(e) => setFarmId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-700 rounded-lg"
              >
                <option value="">Default Farm</option>
                {farms.map((fm) => (
                  <option key={fm.id} value={fm.id}>
                    {fm.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Area
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={areaValue}
                  onChange={(e) => setAreaValue(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-700 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Unit
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
          </div>

          <div className="pt-2 border-t border-stone-200 dark:border-slate-800 space-y-2">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Field Location (Search village / town / district / state / country / ZIP, GPS, or Manual Coordinates)
            </p>
            <LocationPicker value={location} onChange={setLocation} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2 border-t border-stone-200 dark:border-slate-800">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Crop
              </label>
              <select
                value={cropId}
                onChange={(e) => {
                  const nextCrop = getCropById(e.target.value);
                  setCropId(nextCrop.id);
                  if (!nextCrop.stages.includes(growthStage)) {
                    setGrowthStage(nextCrop.stages[0]);
                  }
                }}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-700 rounded-lg"
              >
                {CROP_DATABASE.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.category})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Crop-Specific Growth Stage
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

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Soil Type
              </label>
              <select
                value={soilType}
                onChange={(e) => setSoilType(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-700 rounded-lg"
              >
                <option value="Clay Loam">Clay Loam</option>
                <option value="Sandy Loam">Sandy Loam</option>
                <option value="Silt Loam">Silt Loam</option>
                <option value="Black Cotton (Vertisol)">Black Cotton (Vertisol)</option>
                <option value="Red Laterite">Red Laterite</option>
                <option value="Alluvial">Alluvial</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Irrigation Method
              </label>
              <select
                value={irrigationMethod}
                onChange={(e) => setIrrigationMethod(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-700 rounded-lg"
              >
                <option value="Canal / Bunded Flood">Canal / Bunded Flood</option>
                <option value="Drip Irrigation">Drip Irrigation</option>
                <option value="Sprinkler">Sprinkler</option>
                <option value="Borewell / Furrow">Borewell / Furrow</option>
                <option value="Rainfed">Rainfed</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Planting Date
              </label>
              <input
                type="date"
                value={plantingDate}
                onChange={(e) => setPlantingDate(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-700 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Expected Harvest Date
              </label>
              <input
                type="date"
                value={expectedHarvestDate}
                onChange={(e) => setExpectedHarvestDate(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-700 rounded-lg"
              />
            </div>
            <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 pt-5 cursor-pointer">
              <input
                type="checkbox"
                checked={isPreferred}
                onChange={(e) => setIsPreferred(e.target.checked)}
                className="rounded border-stone-300 text-emerald-700"
              />
              <span>Set as preferred default field</span>
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-700 text-white text-sm font-medium rounded-lg hover:bg-emerald-800 disabled:opacity-60"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{editingId ? 'Update Field' : 'Save Field'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Fields Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {fields.map((f) => {
          const isSelected = selectedField?.id === f.id;
          const crop = getCropById(f.crop_id);
          return (
            <div
              key={f.id}
              className={`bg-white dark:bg-slate-900 border rounded-xl p-5 space-y-3 transition-colors ${
                isSelected
                  ? 'border-emerald-600 dark:border-emerald-500'
                  : 'border-stone-200 dark:border-slate-800'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>{f.farm_name || 'Farm'}</span>
                    <span>·</span>
                    <span>{crop.name}</span>
                    {f.is_preferred === 1 && (
                      <>
                        <span>·</span>
                        <span className="text-emerald-700 dark:text-emerald-400 font-medium">Preferred</span>
                      </>
                    )}
                  </div>
                  <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white mt-0.5">
                    {f.name}
                  </h3>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => startEditField(f)}
                    aria-label={`Edit ${f.name}`}
                    className="p-2 text-slate-500 hover:text-slate-800 dark:hover:text-white rounded-lg hover:bg-stone-100 dark:hover:bg-slate-800"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteField(f.id)}
                    aria-label={`Delete ${f.name}`}
                    className="p-2 text-slate-500 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                <p className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                  <span>
                    {[f.village_city, f.district, f.state_province, f.country].filter(Boolean).join(', ') ||
                      'Manual coordinates'}
                  </span>
                </p>
                <p className="font-mono tabular-nums">
                  {f.latitude.toFixed(4)}, {f.longitude.toFixed(4)} · {f.timezone}
                </p>
                <p>
                  Stage: <strong>{f.growth_stage.replace(/_/g, ' ')}</strong> · {f.area_value} {f.area_unit} ·{' '}
                  {f.soil_type} · {f.irrigation_method}
                </p>
              </div>

              <div className="pt-2 flex items-center justify-between border-t border-stone-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => selectFieldId(f.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg ${
                    isSelected
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                      : 'bg-stone-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-stone-200'
                  }`}
                >
                  {isSelected && <Check className="w-3.5 h-3.5" />}
                  <span>{isSelected ? 'Active Analysis Field' : 'Select for Analysis'}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
