import { Router, type Request, type Response } from 'express';
import { ALL_GROWTH_STAGES, CROP_DATABASE, getCropById, type GrowthStageId } from '../../shared/crops.ts';
import { requireAuth, type AuthenticatedRequest } from '../auth.ts';
import { db } from '../db.ts';
import {
  analyzeCropImageWithGemini,
  generateAgriAssistantReply,
  translateTextWithGemini,
} from '../services/gemini.ts';
import { evaluateFieldRisk, evaluateWaterLevel } from '../services/riskEngine.ts';
import { fetchWeather } from '../services/weather.ts';

export const cropsRouter = Router();
export const waterRouter = Router();
export const alertsRouter = Router();
export const analysisRouter = Router();

function toCm(value: number, unit: string): number {
  if (unit === 'mm') return value / 10;
  if (unit === 'in') return value * 2.54;
  return value;
}

cropsRouter.get('/metadata', (_req: Request, res: Response) => {
  res.json({
    crops: CROP_DATABASE,
    growthStages: ALL_GROWTH_STAGES,
  });
});

// Combined Crop + Weather + Water Risk Analysis
analysisRouter.post('/analyze', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { fieldId, languageCode } = req.body as { fieldId?: number; languageCode?: string };
  if (!fieldId) {
    res.status(400).json({ error: 'fieldId is required.' });
    return;
  }

  const field = db
    .prepare('SELECT * FROM fields WHERE id = ? AND user_id = ?')
    .get(fieldId, req.userId!) as Record<string, unknown> | undefined;

  if (!field) {
    res.status(404).json({ error: 'Field not found.' });
    return;
  }

  const profile = db
    .prepare('SELECT preferred_language FROM farmer_profiles WHERE user_id = ?')
    .get(req.userId!) as { preferred_language: string } | undefined;
  const targetLang = languageCode || profile?.preferred_language || 'en-IN';

  const weather = await fetchWeather(
    Number(field.latitude),
    Number(field.longitude),
    String(field.timezone || 'auto')
  );

  const latestWater = db
    .prepare(
      'SELECT standing_water_cm, measured_at FROM water_measurements WHERE field_id = ? AND user_id = ? ORDER BY measured_at DESC, id DESC LIMIT 1'
    )
    .get(fieldId, req.userId!) as { standing_water_cm: number; measured_at: string } | undefined;

  const latestScan = db
    .prepare(
      'SELECT identified_crop, possible_issues_json, created_at FROM crop_scans WHERE field_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1'
    )
    .get(fieldId, req.userId!) as
    | { identified_crop: string; possible_issues_json: string; created_at: string }
    | undefined;

  const locationLabel =
    [field.village_city, field.district, field.state_province, field.country].filter(Boolean).join(', ') ||
    `${Number(field.latitude).toFixed(4)}, ${Number(field.longitude).toFixed(4)}`;

  const evaluation = evaluateFieldRisk({
    fieldName: String(field.name),
    locationLabel,
    country: String(field.country || ''),
    cropId: String(field.crop_id),
    growthStage: String(field.growth_stage) as GrowthStageId,
    weather,
    latestWaterCm: latestWater ? latestWater.standing_water_cm : null,
    latestWaterTime: latestWater?.measured_at,
    recentScanSummary: latestScan
      ? `${latestScan.identified_crop}: ${latestScan.possible_issues_json}`
      : undefined,
  });

  db.prepare(
    `INSERT INTO risk_assessments (user_id, field_id, overall_level, crop_id, growth_stage, summary, alerts_json, data_sources_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    req.userId!,
    fieldId,
    evaluation.overallLevel,
    evaluation.cropId,
    evaluation.growthStage,
    evaluation.summary,
    JSON.stringify(evaluation.alerts),
    JSON.stringify(evaluation.dataSources)
  );

  // Store alerts & optionally localize for selected language
  const insertAlert = db.prepare(
    `INSERT INTO alerts (
      user_id, field_id, category, severity, title, message, evidence,
      recommended_action, uncertainty, data_source, language_code, translated_text
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const translatedAlerts = await Promise.all(
    evaluation.alerts.map(async (alert) => {
      const fullEnglish = `${alert.title}. ${alert.evidence} Recommended actions: ${alert.recommendedActions.join(' ')}`;
      const { translatedText } = await translateTextWithGemini(fullEnglish, targetLang);
      insertAlert.run(
        req.userId!,
        fieldId,
        alert.category,
        alert.severity,
        alert.title,
        fullEnglish,
        alert.evidence,
        alert.recommendedActions.join(' '),
        alert.uncertainty,
        alert.dataSource,
        targetLang,
        translatedText
      );
      return {
        ...alert,
        languageCode: targetLang,
        translatedText,
      };
    })
  );

  res.json({
    weather,
    evaluation: {
      ...evaluation,
      alerts: translatedAlerts,
    },
  });
});

// AI Crop Scanner
const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

analysisRouter.post('/crop/scan', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { fieldId, cropId, imageBase64, mimeType, languageCode } = req.body as {
    fieldId?: number | null;
    cropId?: string;
    imageBase64?: string;
    mimeType?: string;
    languageCode?: string;
  };

  if (!imageBase64 || !mimeType) {
    res.status(400).json({ error: 'An uploaded or captured crop image is required.' });
    return;
  }
  const cleanMime = mimeType.toLowerCase();
  if (!ALLOWED_IMAGE_MIMES.has(cleanMime)) {
    res.status(400).json({ error: 'Unsupported file type. Upload JPEG, PNG, or WEBP crop images only.' });
    return;
  }

  const rawB64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
  const approxBytes = Math.floor((rawB64.length * 3) / 4);
  if (approxBytes > 8 * 1024 * 1024) {
    res.status(413).json({ error: 'Image size exceeds 8 MB upload limit.' });
    return;
  }

  let fieldRow: Record<string, unknown> | undefined;
  if (fieldId) {
    fieldRow = db
      .prepare('SELECT * FROM fields WHERE id = ? AND user_id = ?')
      .get(fieldId, req.userId!) as Record<string, unknown> | undefined;
  }

  const profile = db
    .prepare('SELECT preferred_language FROM farmer_profiles WHERE user_id = ?')
    .get(req.userId!) as { preferred_language: string } | undefined;
  const targetLang = languageCode || profile?.preferred_language || 'en-IN';
  const crop = getCropById(cropId || String(fieldRow?.crop_id || 'rice'));
  const stage = String(fieldRow?.growth_stage || 'vegetative');
  const locationLabel = fieldRow
    ? [fieldRow.village_city, fieldRow.district, fieldRow.state_province, fieldRow.country]
        .filter(Boolean)
        .join(', ')
    : 'Global farm';

  const result = await analyzeCropImageWithGemini({
    base64Data: rawB64,
    mimeType: cleanMime === 'image/jpg' ? 'image/jpeg' : cleanMime,
    selectedCropName: crop.name,
    growthStage: stage,
    locationLabel,
    languageCode: targetLang,
  });

  const previewDataUrl = `data:${cleanMime};base64,${rawB64.slice(0, 120000)}`;

  const info = db
    .prepare(
      `INSERT INTO crop_scans (
        user_id, field_id, crop_id, image_mime, image_preview, identified_crop,
        symptoms_json, possible_issues_json, uncertainty_note, recommendations_json, provider
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.userId!,
      fieldId ?? null,
      crop.id,
      cleanMime,
      approxBytes <= 250000 ? `data:${cleanMime};base64,${rawB64}` : previewDataUrl,
      result.identifiedCrop,
      JSON.stringify(result.symptoms),
      JSON.stringify(result.possibleIssues),
      result.uncertaintyNote,
      JSON.stringify(result.recommendations),
      result.provider
    );

  res.status(201).json({
    id: Number(info.lastInsertRowid),
    ...result,
  });
});

analysisRouter.get('/crop/scans', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const fieldId = req.query.fieldId ? Number(req.query.fieldId) : null;
  const rows = fieldId
    ? db
        .prepare('SELECT * FROM crop_scans WHERE user_id = ? AND field_id = ? ORDER BY id DESC LIMIT 20')
        .all(req.userId!, fieldId)
    : db
        .prepare('SELECT * FROM crop_scans WHERE user_id = ? ORDER BY id DESC LIMIT 20')
        .all(req.userId!);
  res.json({ scans: rows });
});

// Grounded AI Recommendations Generator
analysisRouter.post('/recommendations/generate', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { fieldId, languageCode } = req.body as { fieldId?: number; languageCode?: string };
  if (!fieldId) {
    res.status(400).json({ error: 'fieldId is required.' });
    return;
  }

  const field = db
    .prepare('SELECT * FROM fields WHERE id = ? AND user_id = ?')
    .get(fieldId, req.userId!) as Record<string, unknown> | undefined;
  if (!field) {
    res.status(404).json({ error: 'Field not found.' });
    return;
  }

  const profile = db
    .prepare('SELECT full_name, preferred_language FROM farmer_profiles WHERE user_id = ?')
    .get(req.userId!) as { full_name: string; preferred_language: string } | undefined;
  const targetLang = languageCode || profile?.preferred_language || 'en-IN';
  const crop = getCropById(String(field.crop_id));

  const weather = await fetchWeather(
    Number(field.latitude),
    Number(field.longitude),
    String(field.timezone || 'auto')
  );
  const latestWater = db
    .prepare('SELECT standing_water_cm, measured_at FROM water_measurements WHERE field_id = ? ORDER BY measured_at DESC LIMIT 1')
    .get(fieldId) as { standing_water_cm: number; measured_at: string } | undefined;

  const weatherSummary =
    weather.dataAvailable && weather.current
      ? `Temp ${weather.current.temperatureC}°C (feels like ${weather.current.apparentTemperatureC}°C), humidity ${weather.current.humidityPercent}%, rain ${weather.current.precipitationMm}mm, wind ${weather.current.windSpeedKmh} km/h (${weather.current.weatherLabel})`
      : `Unavailable (${weather.errorMessage || 'API error'})`;

  const forecastSummary = weather.dataAvailable
    ? weather.daily
        .slice(0, 5)
        .map((d) => `${d.date}: ${d.tempMinC}–${d.tempMaxC}°C, rain ${d.precipitationSumMm}mm (${d.rainProbabilityMaxPercent ?? 0}%)`)
        .join('; ')
    : 'Unavailable';

  const waterSummary = latestWater
    ? `${latestWater.standing_water_cm.toFixed(1)} cm standing water (measured ${latestWater.measured_at})`
    : 'No manual water measurements logged yet';

  const locationLabel = [field.village_city, field.district, field.state_province, field.country]
    .filter(Boolean)
    .join(', ');

  const aiReply = await generateAgriAssistantReply({
    question:
      'Generate 4 concrete, prioritized field action recommendations for today and the next 48 hours based on my crop stage, soil, irrigation method, standing water, and weather forecast.',
    languageCode: targetLang,
    context: {
      farmerName: profile?.full_name,
      fieldName: String(field.name),
      locationLabel,
      country: String(field.country),
      region: String(field.state_province),
      cropName: crop.name,
      growthStage: String(field.growth_stage),
      soilType: String(field.soil_type),
      irrigationMethod: String(field.irrigation_method),
      weatherSummary,
      forecastSummary,
      waterSummary,
    },
  });

  const info = db
    .prepare(
      `INSERT INTO recommendations (user_id, field_id, language_code, title, content, provider, is_fallback)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.userId!,
      fieldId,
      targetLang,
      `${crop.name} Advisory — ${String(field.name)}`,
      aiReply.answer,
      aiReply.provider,
      aiReply.isFallback ? 1 : 0
    );

  res.status(201).json({
    id: Number(info.lastInsertRowid),
    title: `${crop.name} Advisory — ${String(field.name)}`,
    content: aiReply.answer,
    provider: aiReply.provider,
    isFallback: aiReply.isFallback,
    languageCode: targetLang,
  });
});

// Manual Water-Level Monitoring
waterRouter.post('/measurements', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { fieldId, cropId, growthStage, value, unit, measuredAt, notes } = req.body as {
    fieldId?: number;
    cropId?: string;
    growthStage?: string;
    value?: number;
    unit?: string;
    measuredAt?: string;
    notes?: string;
  };

  if (!fieldId || value === undefined || !Number.isFinite(Number(value)) || Number(value) < 0) {
    res.status(400).json({ error: 'Valid fieldId and non-negative standing water depth value are required.' });
    return;
  }

  const field = db
    .prepare('SELECT * FROM fields WHERE id = ? AND user_id = ?')
    .get(fieldId, req.userId!) as Record<string, unknown> | undefined;
  if (!field) {
    res.status(404).json({ error: 'Field not found.' });
    return;
  }

  const cleanUnit = ['cm', 'mm', 'in'].includes(unit || '') ? unit! : 'cm';
  const origVal = Number(value);
  const standardizedCm = toCm(origVal, cleanUnit);
  const chosenCrop = cropId?.trim() || String(field.crop_id);
  const chosenStage = (growthStage?.trim() || String(field.growth_stage)) as GrowthStageId;
  const timestamp = measuredAt?.trim() || new Date().toISOString();

  const info = db
    .prepare(
      `INSERT INTO water_measurements (
        user_id, field_id, crop_id, growth_stage, standing_water_cm,
        original_value, original_unit, source, notes, measured_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'MANUAL', ?, ?)`
    )
    .run(
      req.userId!,
      fieldId,
      chosenCrop,
      chosenStage,
      standardizedCm,
      origVal,
      cleanUnit,
      notes?.trim() || '',
      timestamp
    );

  const assessment = evaluateWaterLevel(chosenCrop, chosenStage, standardizedCm);
  const record = db.prepare('SELECT * FROM water_measurements WHERE id = ?').get(Number(info.lastInsertRowid));

  res.status(201).json({
    measurement: record,
    assessment,
  });
});

waterRouter.put('/measurements/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  const existing = db
    .prepare('SELECT * FROM water_measurements WHERE id = ? AND user_id = ?')
    .get(id, req.userId!) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Measurement not found.' });
    return;
  }

  const { value, unit, measuredAt, notes, cropId, growthStage } = req.body as {
    value?: number;
    unit?: string;
    measuredAt?: string;
    notes?: string;
    cropId?: string;
    growthStage?: string;
  };

  const cleanUnit = ['cm', 'mm', 'in'].includes(unit || '') ? unit! : String(existing.original_unit);
  const origVal = value !== undefined ? Number(value) : Number(existing.original_value);
  if (!Number.isFinite(origVal) || origVal < 0) {
    res.status(400).json({ error: 'Measurement value must be >= 0.' });
    return;
  }
  const cmVal = toCm(origVal, cleanUnit);

  db.prepare(
    `UPDATE water_measurements SET
      crop_id = ?, growth_stage = ?, standing_water_cm = ?,
      original_value = ?, original_unit = ?, notes = ?, measured_at = ?
     WHERE id = ? AND user_id = ?`
  ).run(
    cropId?.trim() || String(existing.crop_id),
    growthStage?.trim() || String(existing.growth_stage),
    cmVal,
    origVal,
    cleanUnit,
    notes !== undefined ? notes.trim() : String(existing.notes ?? ''),
    measuredAt?.trim() || String(existing.measured_at),
    id,
    req.userId!
  );

  const updated = db.prepare('SELECT * FROM water_measurements WHERE id = ?').get(id);
  res.json({ measurement: updated });
});

waterRouter.get('/measurements', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const fieldId = req.query.fieldId ? Number(req.query.fieldId) : null;
  const rows = fieldId
    ? db
        .prepare(
          'SELECT * FROM water_measurements WHERE user_id = ? AND field_id = ? ORDER BY measured_at DESC, id DESC LIMIT 100'
        )
        .all(req.userId!, fieldId)
    : db
        .prepare('SELECT * FROM water_measurements WHERE user_id = ? ORDER BY measured_at DESC, id DESC LIMIT 100')
        .all(req.userId!);
  res.json({ measurements: rows });
});

waterRouter.get('/assessment', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const fieldId = Number(req.query.fieldId);
  if (!fieldId) {
    res.status(400).json({ error: 'fieldId query parameter is required.' });
    return;
  }
  const field = db
    .prepare('SELECT * FROM fields WHERE id = ? AND user_id = ?')
    .get(fieldId, req.userId!) as Record<string, unknown> | undefined;
  if (!field) {
    res.status(404).json({ error: 'Field not found.' });
    return;
  }
  const latest = db
    .prepare(
      'SELECT * FROM water_measurements WHERE field_id = ? AND user_id = ? ORDER BY measured_at DESC, id DESC LIMIT 1'
    )
    .get(fieldId, req.userId!) as { standing_water_cm: number; crop_id: string; growth_stage: string } | undefined;

  const assessment = evaluateWaterLevel(
    latest?.crop_id || String(field.crop_id),
    (latest?.growth_stage || String(field.growth_stage)) as GrowthStageId,
    latest ? latest.standing_water_cm : null
  );
  res.json({ assessment, latestMeasurement: latest ?? null });
});

// Alerts & Analytics History
alertsRouter.get('/', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const fieldId = req.query.fieldId ? Number(req.query.fieldId) : null;
  const rows = fieldId
    ? db
        .prepare('SELECT * FROM alerts WHERE user_id = ? AND field_id = ? ORDER BY id DESC LIMIT 25')
        .all(req.userId!, fieldId)
    : db.prepare('SELECT * FROM alerts WHERE user_id = ? ORDER BY id DESC LIMIT 25').all(req.userId!);
  res.json({ alerts: rows });
});

alertsRouter.get('/history', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const fieldId = req.query.fieldId ? Number(req.query.fieldId) : null;
  const category = req.query.category ? String(req.query.category).trim() : '';
  const severity = req.query.severity ? String(req.query.severity).trim() : '';
  const fromDate = req.query.from ? String(req.query.from).trim() : '';

  const clauses = ['user_id = ?'];
  const params: Array<string | number> = [req.userId!];
  if (fieldId) {
    clauses.push('field_id = ?');
    params.push(fieldId);
  }
  if (category) {
    clauses.push('category = ?');
    params.push(category);
  }
  if (severity) {
    clauses.push('severity = ?');
    params.push(severity);
  }
  if (fromDate) {
    clauses.push('date(created_at) >= date(?)');
    params.push(fromDate);
  }

  const alerts = db
    .prepare(`SELECT * FROM alerts WHERE ${clauses.join(' AND ')} ORDER BY id DESC LIMIT 100`)
    .all(...params);

  const riskHistory = fieldId
    ? db
        .prepare(
          'SELECT id, field_id, overall_level, crop_id, growth_stage, summary, assessed_at FROM risk_assessments WHERE user_id = ? AND field_id = ? ORDER BY assessed_at DESC LIMIT 30'
        )
        .all(req.userId!, fieldId)
    : db
        .prepare(
          'SELECT id, field_id, overall_level, crop_id, growth_stage, summary, assessed_at FROM risk_assessments WHERE user_id = ? ORDER BY assessed_at DESC LIMIT 30'
        )
        .all(req.userId!);

  const weatherHistory = fieldId
    ? db
        .prepare(
          'SELECT id, field_id, temperature_c, rainfall_mm, humidity, wind_speed_kmh, fetched_at FROM weather_records WHERE field_id = ? ORDER BY id DESC LIMIT 30'
        )
        .all(fieldId)
    : db
        .prepare(
          `SELECT w.id, w.field_id, w.temperature_c, w.rainfall_mm, w.humidity, w.wind_speed_kmh, w.fetched_at
           FROM weather_records w
           INNER JOIN fields f ON f.id = w.field_id
           WHERE f.user_id = ?
           ORDER BY w.id DESC LIMIT 30`
        )
        .all(req.userId!);

  const recommendations = db
    .prepare('SELECT * FROM recommendations WHERE user_id = ? ORDER BY id DESC LIMIT 20')
    .all(req.userId!);

  res.json({
    alerts,
    riskHistory,
    weatherHistory,
    recommendations,
  });
});
