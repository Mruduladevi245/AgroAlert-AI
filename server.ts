import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import express, { type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { hashPassword } from './server/auth.ts';
import { db, initDatabase } from './server/db.ts';
import {
  alertsRouter,
  analysisRouter,
  cropsRouter,
  waterRouter,
} from './server/routes/agriAiRoutes.ts';
import { authRouter } from './server/routes/authRoutes.ts';
import {
  farmerRouter,
  fieldsRouter,
  locationRouter,
  weatherRouter,
} from './server/routes/fieldWeatherRoutes.ts';
import { notificationsRouter, voiceRouter } from './server/routes/voiceNotifyRoutes.ts';
import { isGeminiConfigured } from './server/services/gemini.ts';
import { isTwilioConfigured } from './server/services/notifications.ts';

initDatabase();

function ensureDemoAccount(): void {
  const count = db.prepare('SELECT COUNT(*) AS cnt FROM users').get() as { cnt: number };
  if (count.cnt > 0) return;

  const userRes = db
    .prepare('INSERT INTO users (email, phone, password_hash) VALUES (?, ?, ?)')
    .run('demo@agroalert.ai', '+919876543210', hashPassword('AgroAlert2026!'));
  const userId = Number(userRes.lastInsertRowid);

  db.prepare(
    `INSERT INTO farmer_profiles (
      user_id, full_name, country, state_region, district, village_city,
      preferred_language, temp_unit, rain_unit, area_unit, wind_unit, depth_unit, sms_consent
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'C', 'mm', 'hectares', 'kmh', 'cm', 1)`
  ).run(userId, 'Kavitha Gowda', 'India', 'Karnataka', 'Mandya', 'Maddur', 'en-IN');

  const farm1 = db
    .prepare('INSERT INTO farms (user_id, name, country, region, notes) VALUES (?, ?, ?, ?, ?)')
    .run(userId, 'Cauvery Basin Cooperative Farm', 'India', 'Karnataka', 'Irrigated lowland and millet blocks');
  const farm1Id = Number(farm1.lastInsertRowid);

  const farm2 = db
    .prepare('INSERT INTO farms (user_id, name, country, region, notes) VALUES (?, ?, ?, ?, ?)')
    .run(userId, 'Fenland Arable Plot', 'United Kingdom', 'England', 'Rainfed winter cereal block');
  const farm2Id = Number(farm2.lastInsertRowid);

  const field1 = db
    .prepare(
      `INSERT INTO fields (
        user_id, farm_id, name, country, state_province, district, village_city, postal_code,
        latitude, longitude, timezone, area_value, area_unit, soil_type, irrigation_method,
        crop_id, growth_stage, planting_date, expected_harvest_date, is_preferred
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    )
    .run(
      userId,
      farm1Id,
      'Maddur Paddy Block A',
      'India',
      'Karnataka',
      'Mandya',
      'Maddur',
      '571428',
      12.5841,
      77.0439,
      'Asia/Kolkata',
      2.4,
      'hectares',
      'Clay Loam',
      'Canal Flood / Bunded',
      'rice',
      'flowering',
      '2026-08-10',
      '2026-12-15'
    );

  db.prepare(
    `INSERT INTO fields (
      user_id, farm_id, name, country, state_province, district, village_city, postal_code,
      latitude, longitude, timezone, area_value, area_unit, soil_type, irrigation_method,
      crop_id, growth_stage, planting_date, expected_harvest_date, is_preferred
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
  ).run(
    userId,
    farm2Id,
    'Ely Wheat Terrace',
    'United Kingdom',
    'England',
    'Cambridgeshire',
    'Ely',
    'CB7',
    52.3995,
    0.2624,
    'Europe/London',
    4.5,
    'hectares',
    'Silt Loam',
    'Rainfed',
    'wheat',
    'vegetative',
    '2026-09-25',
    '2027-07-20'
  );

  const f1Id = Number(field1.lastInsertRowid);
  db.prepare(
    `INSERT INTO water_measurements (
      user_id, field_id, crop_id, growth_stage, standing_water_cm,
      original_value, original_unit, source, notes, measured_at
    ) VALUES (?, ?, 'rice', 'flowering', ?, ?, 'cm', 'MANUAL', ?, ?)`
  ).run(userId, f1Id, 4.2, 4.2, 'Morning bund gauge reading', new Date().toISOString());
}

ensureDemoAccount();

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.set('trust proxy', 1);
app.use(express.json({ limit: '14mb' }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please wait a few minutes.' },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth', authLimiter, authRouter);
app.use('/api/farmer', apiLimiter, farmerRouter);
app.use('/api/fields', apiLimiter, fieldsRouter);
app.use('/api/location', apiLimiter, locationRouter);
app.use('/api/weather', apiLimiter, weatherRouter);
app.use('/api/crops', apiLimiter, cropsRouter);
app.use('/api/water', apiLimiter, waterRouter);
app.use('/api/alerts', apiLimiter, alertsRouter);
app.use('/api/voice', apiLimiter, voiceRouter);
app.use('/api/notifications', apiLimiter, notificationsRouter);
app.use('/api', apiLimiter, analysisRouter);

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'AgroAlert AI API',
    timestamp: new Date().toISOString(),
    database: 'sqlite (node:sqlite)',
    integrations: {
      openMeteoWeather: 'active',
      openMeteoGeocoding: 'active',
      geminiAi: isGeminiConfigured() ? 'configured' : 'not_configured (rule-based fallback)',
      googleCloudTts:
        process.env.GOOGLE_CLOUD_TTS_API_KEY && process.env.GOOGLE_CLOUD_TTS_API_KEY.trim().length > 10
          ? 'configured'
          : 'not_configured (using Gemini TTS / browser speech)',
      twilioSms: isTwilioConfigured() ? 'configured' : 'demo_mode',
    },
  });
});

async function startServer(): Promise<void> {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AgroAlert AI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start AgroAlert AI server:', err);
  process.exit(1);
});
