import { Router, type Request, type Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../auth.ts';
import { db } from '../db.ts';
import { fetchWeather, reverseGeocode, searchLocations } from '../services/weather.ts';

export const farmerRouter = Router();
export const fieldsRouter = Router();
export const locationRouter = Router();
export const weatherRouter = Router();

// Farmer Profile & Farms
farmerRouter.get('/profile', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = db
    .prepare('SELECT id, email, phone, created_at FROM users WHERE id = ?')
    .get(req.userId!) as Record<string, unknown>;
  const profile = db
    .prepare('SELECT * FROM farmer_profiles WHERE user_id = ?')
    .get(req.userId!) as Record<string, unknown> | undefined;
  const farms = db
    .prepare('SELECT * FROM farms WHERE user_id = ? ORDER BY id ASC')
    .all(req.userId!) as Array<Record<string, unknown>>;
  const passkeys = db
    .prepare('SELECT id, device_label, created_at FROM passkey_credentials WHERE user_id = ?')
    .all(req.userId!) as Array<Record<string, unknown>>;

  res.json({ user, profile, farms, passkeys });
});

farmerRouter.put('/profile', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const body = req.body as {
    fullName?: string;
    phone?: string;
    country?: string;
    stateRegion?: string;
    district?: string;
    villageCity?: string;
    preferredLanguage?: string;
    tempUnit?: string;
    rainUnit?: string;
    areaUnit?: string;
    windUnit?: string;
    depthUnit?: string;
    smsConsent?: boolean;
    autoVoiceAlerts?: boolean;
  };

  if (body.phone !== undefined) {
    const cleanPhone = body.phone.trim() || null;
    if (cleanPhone) {
      const conflict = db
        .prepare('SELECT id FROM users WHERE phone = ? AND id != ?')
        .get(cleanPhone, req.userId!);
      if (conflict) {
        res.status(409).json({ error: 'Phone number already linked to another account.' });
        return;
      }
    }
    db.prepare("UPDATE users SET phone = ?, updated_at = datetime('now') WHERE id = ?").run(
      cleanPhone,
      req.userId!
    );
  }

  const existing = db
    .prepare('SELECT * FROM farmer_profiles WHERE user_id = ?')
    .get(req.userId!) as Record<string, unknown>;

  db.prepare(
    `UPDATE farmer_profiles SET
      full_name = ?,
      country = ?,
      state_region = ?,
      district = ?,
      village_city = ?,
      preferred_language = ?,
      temp_unit = ?,
      rain_unit = ?,
      area_unit = ?,
      wind_unit = ?,
      depth_unit = ?,
      sms_consent = ?,
      auto_voice_alerts = ?,
      updated_at = datetime('now')
     WHERE user_id = ?`
  ).run(
    body.fullName?.trim() ?? String(existing.full_name ?? ''),
    body.country?.trim() ?? String(existing.country ?? ''),
    body.stateRegion?.trim() ?? String(existing.state_region ?? ''),
    body.district?.trim() ?? String(existing.district ?? ''),
    body.villageCity?.trim() ?? String(existing.village_city ?? ''),
    body.preferredLanguage?.trim() ?? String(existing.preferred_language ?? 'en-IN'),
    body.tempUnit === 'F' ? 'F' : body.tempUnit === 'C' ? 'C' : String(existing.temp_unit ?? 'C'),
    ['mm', 'cm', 'in'].includes(body.rainUnit || '') ? (body.rainUnit as string) : String(existing.rain_unit ?? 'mm'),
    ['hectares', 'acres'].includes(body.areaUnit || '') ? (body.areaUnit as string) : String(existing.area_unit ?? 'hectares'),
    ['kmh', 'mph', 'ms'].includes(body.windUnit || '') ? (body.windUnit as string) : String(existing.wind_unit ?? 'kmh'),
    ['cm', 'mm', 'in'].includes(body.depthUnit || '') ? (body.depthUnit as string) : String(existing.depth_unit ?? 'cm'),
    body.smsConsent !== undefined ? (body.smsConsent ? 1 : 0) : Number(existing.sms_consent ?? 0),
    body.autoVoiceAlerts !== undefined ? (body.autoVoiceAlerts ? 1 : 0) : Number(existing.auto_voice_alerts ?? 0),
    req.userId!
  );

  const updated = db.prepare('SELECT * FROM farmer_profiles WHERE user_id = ?').get(req.userId!);
  const user = db.prepare('SELECT id, email, phone FROM users WHERE id = ?').get(req.userId!);
  res.json({ user, profile: updated });
});

farmerRouter.post('/farms', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { name, country, region, notes } = req.body as {
    name?: string;
    country?: string;
    region?: string;
    notes?: string;
  };
  if (!name?.trim()) {
    res.status(400).json({ error: 'Farm name is required.' });
    return;
  }
  const result = db
    .prepare('INSERT INTO farms (user_id, name, country, region, notes) VALUES (?, ?, ?, ?, ?)')
    .run(req.userId!, name.trim(), country?.trim() || '', region?.trim() || '', notes?.trim() || '');
  const farm = db.prepare('SELECT * FROM farms WHERE id = ?').get(Number(result.lastInsertRowid));
  res.status(201).json({ farm });
});

// Fields CRUD + Location update
fieldsRouter.get('/', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const fields = db
    .prepare(
      `SELECT f.*, fa.name AS farm_name
       FROM fields f
       LEFT JOIN farms fa ON fa.id = f.farm_id
       WHERE f.user_id = ?
       ORDER BY f.is_preferred DESC, f.id ASC`
    )
    .all(req.userId!);
  res.json({ fields });
});

fieldsRouter.post('/', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const body = req.body as {
    farmId?: number | null;
    name?: string;
    country?: string;
    stateProvince?: string;
    district?: string;
    villageCity?: string;
    postalCode?: string;
    latitude?: number;
    longitude?: number;
    timezone?: string;
    areaValue?: number;
    areaUnit?: string;
    soilType?: string;
    irrigationMethod?: string;
    cropId?: string;
    growthStage?: string;
    plantingDate?: string;
    expectedHarvestDate?: string;
    isPreferred?: boolean;
  };

  if (!body.name?.trim()) {
    res.status(400).json({ error: 'Field name is required.' });
    return;
  }
  const lat = Number(body.latitude);
  const lon = Number(body.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    res.status(400).json({ error: 'Valid latitude (-90..90) and longitude (-180..180) are required.' });
    return;
  }

  let farmId = body.farmId ?? null;
  if (!farmId) {
    const firstFarm = db
      .prepare('SELECT id FROM farms WHERE user_id = ? ORDER BY id ASC LIMIT 1')
      .get(req.userId!) as { id: number } | undefined;
    if (firstFarm) {
      farmId = firstFarm.id;
    } else {
      const fRes = db
        .prepare('INSERT INTO farms (user_id, name, country, region) VALUES (?, ?, ?, ?)')
        .run(req.userId!, 'Main Farm', body.country?.trim() || '', body.stateProvince?.trim() || '');
      farmId = Number(fRes.lastInsertRowid);
    }
  }

  if (body.isPreferred) {
    db.prepare('UPDATE fields SET is_preferred = 0 WHERE user_id = ?').run(req.userId!);
  }

  const countRow = db
    .prepare('SELECT COUNT(*) AS cnt FROM fields WHERE user_id = ?')
    .get(req.userId!) as { cnt: number };
  const markPreferred = body.isPreferred || countRow.cnt === 0 ? 1 : 0;

  const insert = db.prepare(
    `INSERT INTO fields (
      user_id, farm_id, name, country, state_province, district, village_city, postal_code,
      latitude, longitude, timezone, area_value, area_unit, soil_type, irrigation_method,
      crop_id, growth_stage, planting_date, expected_harvest_date, is_preferred
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const info = insert.run(
    req.userId!,
    farmId,
    body.name.trim(),
    body.country?.trim() || '',
    body.stateProvince?.trim() || '',
    body.district?.trim() || '',
    body.villageCity?.trim() || '',
    body.postalCode?.trim() || '',
    lat,
    lon,
    body.timezone?.trim() || 'auto',
    Number(body.areaValue) > 0 ? Number(body.areaValue) : 1.0,
    body.areaUnit === 'acres' ? 'acres' : 'hectares',
    body.soilType?.trim() || 'Loam',
    body.irrigationMethod?.trim() || 'Drip / Surface',
    body.cropId?.trim() || 'rice',
    body.growthStage?.trim() || 'vegetative',
    body.plantingDate || '',
    body.expectedHarvestDate || '',
    markPreferred
  );

  const fieldId = Number(info.lastInsertRowid);
  db.prepare('INSERT INTO growth_records (field_id, crop_id, growth_stage, notes) VALUES (?, ?, ?, ?)').run(
    fieldId,
    body.cropId?.trim() || 'rice',
    body.growthStage?.trim() || 'vegetative',
    'Initial crop stage registered'
  );

  const field = db.prepare('SELECT * FROM fields WHERE id = ?').get(fieldId);
  res.status(201).json({ field });
});

fieldsRouter.put('/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const fieldId = Number(req.params.id);
  const existing = db
    .prepare('SELECT * FROM fields WHERE id = ? AND user_id = ?')
    .get(fieldId, req.userId!) as Record<string, unknown> | undefined;

  if (!existing) {
    res.status(404).json({ error: 'Field not found.' });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const lat = body.latitude !== undefined ? Number(body.latitude) : Number(existing.latitude);
  const lon = body.longitude !== undefined ? Number(body.longitude) : Number(existing.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    res.status(400).json({ error: 'Invalid latitude or longitude.' });
    return;
  }

  if (body.isPreferred) {
    db.prepare('UPDATE fields SET is_preferred = 0 WHERE user_id = ?').run(req.userId!);
  }

  const nextCrop = (body.cropId as string)?.trim() ?? (existing.crop_id as string);
  const nextStage = (body.growthStage as string)?.trim() ?? (existing.growth_stage as string);

  db.prepare(
    `UPDATE fields SET
      name = ?,
      country = ?,
      state_province = ?,
      district = ?,
      village_city = ?,
      postal_code = ?,
      latitude = ?,
      longitude = ?,
      timezone = ?,
      area_value = ?,
      area_unit = ?,
      soil_type = ?,
      irrigation_method = ?,
      crop_id = ?,
      growth_stage = ?,
      planting_date = ?,
      expected_harvest_date = ?,
      is_preferred = ?,
      updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`
  ).run(
    (body.name as string)?.trim() ?? String(existing.name ?? ''),
    (body.country as string)?.trim() ?? String(existing.country ?? ''),
    (body.stateProvince as string)?.trim() ?? String(existing.state_province ?? ''),
    (body.district as string)?.trim() ?? String(existing.district ?? ''),
    (body.villageCity as string)?.trim() ?? String(existing.village_city ?? ''),
    (body.postalCode as string)?.trim() ?? String(existing.postal_code ?? ''),
    lat,
    lon,
    (body.timezone as string)?.trim() ?? String(existing.timezone ?? 'auto'),
    body.areaValue !== undefined ? Number(body.areaValue) : Number(existing.area_value ?? 1),
    body.areaUnit === 'acres' || body.areaUnit === 'hectares' ? body.areaUnit : String(existing.area_unit ?? 'hectares'),
    (body.soilType as string)?.trim() ?? String(existing.soil_type ?? 'Loam'),
    (body.irrigationMethod as string)?.trim() ?? String(existing.irrigation_method ?? 'Surface'),
    nextCrop,
    nextStage,
    (body.plantingDate as string) ?? String(existing.planting_date ?? ''),
    (body.expectedHarvestDate as string) ?? String(existing.expected_harvest_date ?? ''),
    body.isPreferred !== undefined ? (body.isPreferred ? 1 : 0) : Number(existing.is_preferred ?? 0),
    fieldId,
    req.userId!
  );

  if (nextCrop !== existing.crop_id || nextStage !== existing.growth_stage) {
    db.prepare('INSERT INTO growth_records (field_id, crop_id, growth_stage, notes) VALUES (?, ?, ?, ?)').run(
      fieldId,
      nextCrop,
      nextStage,
      'Updated crop / growth stage'
    );
  }

  const updated = db.prepare('SELECT * FROM fields WHERE id = ?').get(fieldId);
  res.json({ field: updated });
});

fieldsRouter.delete('/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const fieldId = Number(req.params.id);
  const info = db
    .prepare('DELETE FROM fields WHERE id = ? AND user_id = ?')
    .run(fieldId, req.userId!);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Field not found.' });
    return;
  }
  res.json({ ok: true });
});

fieldsRouter.post('/location', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const body = req.body as {
    fieldId: number;
    latitude: number;
    longitude: number;
    country?: string;
    stateProvince?: string;
    district?: string;
    villageCity?: string;
    postalCode?: string;
    timezone?: string;
  };
  const lat = Number(body.latitude);
  const lon = Number(body.longitude);
  if (!body.fieldId || !Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    res.status(400).json({ error: 'Valid fieldId and coordinates are required.' });
    return;
  }

  const info = db
    .prepare(
      `UPDATE fields SET
        latitude = ?, longitude = ?, country = COALESCE(?, country),
        state_province = COALESCE(?, state_province), district = COALESCE(?, district),
        village_city = COALESCE(?, village_city), postal_code = COALESCE(?, postal_code),
        timezone = COALESCE(?, timezone), updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`
    )
    .run(
      lat,
      lon,
      body.country ?? null,
      body.stateProvince ?? null,
      body.district ?? null,
      body.villageCity ?? null,
      body.postalCode ?? null,
      body.timezone ?? null,
      body.fieldId,
      req.userId!
    );

  if (info.changes === 0) {
    res.status(404).json({ error: 'Field not found.' });
    return;
  }
  const field = db.prepare('SELECT * FROM fields WHERE id = ?').get(body.fieldId);
  res.json({ field });
});

// Global Location Search & Reverse Geocode (publicly accessible for registration & global search)
locationRouter.get('/search', async (req: Request, res: Response) => {
  const q = String(req.query.q || '');
  const count = Number(req.query.count || 10);
  const result = await searchLocations(q, count);
  res.json(result);
});

locationRouter.get('/reverse-geocode', async (req: Request, res: Response) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    res.status(400).json({ error: 'Valid lat and lon query parameters are required.' });
    return;
  }
  try {
    const result = await reverseGeocode(lat, lon);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Reverse geocode failed' });
  }
});

// Live Weather Endpoint
weatherRouter.get('/', async (req: Request, res: Response) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  const tz = String(req.query.timezone || 'auto');
  const fieldId = req.query.fieldId ? Number(req.query.fieldId) : null;
  const locationLabel = String(req.query.label || '');

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    res.status(400).json({
      dataAvailable: false,
      errorMessage: 'Valid numeric lat and lon query parameters are required.',
    });
    return;
  }

  const weather = await fetchWeather(lat, lon, tz);

  if (weather.dataAvailable && weather.current) {
    try {
      db.prepare(
        `INSERT INTO weather_records (
          field_id, latitude, longitude, location_label, source,
          temperature_c, apparent_temp_c, humidity, rainfall_mm, rain_probability,
          wind_speed_kmh, wind_direction, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        fieldId,
        weather.latitude,
        weather.longitude,
        locationLabel,
        weather.source,
        weather.current.temperatureC,
        weather.current.apparentTemperatureC,
        weather.current.humidityPercent,
        weather.current.precipitationMm,
        weather.hourly[0]?.rainProbabilityPercent ?? null,
        weather.current.windSpeedKmh,
        weather.current.windDirectionDeg,
        JSON.stringify({ current: weather.current, daily: weather.daily })
      );
    } catch {
      // Non-blocking audit cache failure
    }
  }

  res.json(weather);
});
