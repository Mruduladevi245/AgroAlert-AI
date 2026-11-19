import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { CROP_DATABASE } from '../shared/crops.ts';

const dbPath = process.env.SQLITE_DB_PATH
  ? path.resolve(process.cwd(), process.env.SQLITE_DB_PATH)
  : path.resolve(process.cwd(), 'data', 'agroalert.db');

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      phone TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS farmer_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      country TEXT NOT NULL DEFAULT '',
      state_region TEXT NOT NULL DEFAULT '',
      district TEXT NOT NULL DEFAULT '',
      village_city TEXT NOT NULL DEFAULT '',
      preferred_language TEXT NOT NULL DEFAULT 'en-IN',
      temp_unit TEXT NOT NULL DEFAULT 'C',
      rain_unit TEXT NOT NULL DEFAULT 'mm',
      area_unit TEXT NOT NULL DEFAULT 'hectares',
      wind_unit TEXT NOT NULL DEFAULT 'kmh',
      depth_unit TEXT NOT NULL DEFAULT 'cm',
      sms_consent INTEGER NOT NULL DEFAULT 0,
      auto_voice_alerts INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS farms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      country TEXT NOT NULL DEFAULT '',
      region TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS fields (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      farm_id INTEGER,
      name TEXT NOT NULL,
      country TEXT NOT NULL DEFAULT '',
      state_province TEXT NOT NULL DEFAULT '',
      district TEXT NOT NULL DEFAULT '',
      village_city TEXT NOT NULL DEFAULT '',
      postal_code TEXT NOT NULL DEFAULT '',
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'auto',
      area_value REAL NOT NULL DEFAULT 1.0,
      area_unit TEXT NOT NULL DEFAULT 'hectares',
      soil_type TEXT NOT NULL DEFAULT 'Loam',
      irrigation_method TEXT NOT NULL DEFAULT 'Canal / Surface',
      crop_id TEXT NOT NULL DEFAULT 'rice',
      growth_stage TEXT NOT NULL DEFAULT 'vegetative',
      planting_date TEXT DEFAULT '',
      expected_harvest_date TEXT DEFAULT '',
      is_preferred INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS crops (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      scientific_name TEXT NOT NULL,
      category TEXT NOT NULL,
      metadata_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS growth_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      field_id INTEGER NOT NULL,
      crop_id TEXT NOT NULL,
      growth_stage TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (field_id) REFERENCES fields(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS weather_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      field_id INTEGER,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      location_label TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL,
      temperature_c REAL,
      apparent_temp_c REAL,
      humidity REAL,
      rainfall_mm REAL,
      rain_probability REAL,
      wind_speed_kmh REAL,
      wind_direction REAL,
      payload_json TEXT NOT NULL,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS risk_assessments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      field_id INTEGER NOT NULL,
      overall_level TEXT NOT NULL,
      crop_id TEXT NOT NULL,
      growth_stage TEXT NOT NULL,
      summary TEXT NOT NULL,
      alerts_json TEXT NOT NULL,
      data_sources_json TEXT NOT NULL,
      assessed_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (field_id) REFERENCES fields(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS water_measurements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      field_id INTEGER NOT NULL,
      crop_id TEXT NOT NULL,
      growth_stage TEXT NOT NULL,
      standing_water_cm REAL NOT NULL,
      original_value REAL NOT NULL,
      original_unit TEXT NOT NULL DEFAULT 'cm',
      source TEXT NOT NULL DEFAULT 'MANUAL',
      notes TEXT NOT NULL DEFAULT '',
      measured_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (field_id) REFERENCES fields(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS crop_scans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      field_id INTEGER,
      crop_id TEXT NOT NULL,
      image_mime TEXT NOT NULL,
      image_preview TEXT NOT NULL,
      identified_crop TEXT NOT NULL,
      symptoms_json TEXT NOT NULL,
      possible_issues_json TEXT NOT NULL,
      uncertainty_note TEXT NOT NULL,
      recommendations_json TEXT NOT NULL,
      provider TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS recommendations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      field_id INTEGER NOT NULL,
      language_code TEXT NOT NULL DEFAULT 'en-IN',
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      provider TEXT NOT NULL,
      is_fallback INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (field_id) REFERENCES fields(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      field_id INTEGER NOT NULL,
      category TEXT NOT NULL,
      severity TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      evidence TEXT NOT NULL,
      recommended_action TEXT NOT NULL,
      uncertainty TEXT NOT NULL DEFAULT '',
      data_source TEXT NOT NULL,
      language_code TEXT NOT NULL DEFAULT 'en-IN',
      translated_text TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (field_id) REFERENCES fields(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      field_id INTEGER,
      channel TEXT NOT NULL DEFAULT 'SMS',
      recipient TEXT NOT NULL,
      language_code TEXT NOT NULL DEFAULT 'en-IN',
      message_text TEXT NOT NULL,
      status TEXT NOT NULL,
      mode TEXT NOT NULL,
      provider_ref TEXT DEFAULT '',
      error_message TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS voice_interactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      field_id INTEGER,
      language_code TEXT NOT NULL,
      question_text TEXT NOT NULL,
      answer_text TEXT NOT NULL,
      stt_provider TEXT NOT NULL DEFAULT 'text',
      tts_provider TEXT NOT NULL DEFAULT 'none',
      ai_provider TEXT NOT NULL DEFAULT 'gemini',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS passkey_credentials (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      public_key TEXT NOT NULL,
      counter INTEGER NOT NULL DEFAULT 0,
      transports_json TEXT NOT NULL DEFAULT '[]',
      device_label TEXT NOT NULL DEFAULT 'Platform Biometric Passkey',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS auth_challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      challenge TEXT NOT NULL,
      purpose TEXT NOT NULL,
      user_id INTEGER,
      identifier TEXT DEFAULT '',
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const upsertCrop = db.prepare(`
    INSERT INTO crops (id, name, scientific_name, category, metadata_json)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      scientific_name = excluded.scientific_name,
      category = excluded.category,
      metadata_json = excluded.metadata_json
  `);

  for (const crop of CROP_DATABASE) {
    upsertCrop.run(crop.id, crop.name, crop.scientificName, crop.category, JSON.stringify(crop));
  }
}
