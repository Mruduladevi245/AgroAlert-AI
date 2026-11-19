import { Router, type Request, type Response } from 'express';
import { getCropById } from '../../shared/crops.ts';
import { requireAuth, type AuthenticatedRequest } from '../auth.ts';
import { db } from '../db.ts';
import { generateAgriAssistantReply, translateTextWithGemini } from '../services/gemini.ts';
import { isTwilioConfigured, sendSmsNotification } from '../services/notifications.ts';
import {
  getVoiceLanguageCapabilities,
  recognizeSpeech,
  synthesizeSpeech,
} from '../services/voice.ts';
import { fetchWeather } from '../services/weather.ts';

export const voiceRouter = Router();
export const notificationsRouter = Router();

voiceRouter.get('/languages', (_req: Request, res: Response) => {
  res.json(getVoiceLanguageCapabilities());
});


voiceRouter.post('/generate', async (req: Request, res: Response) => {
  const { text, languageCode, voicePreference } = req.body as {
    text?: string;
    languageCode?: string;
    voicePreference?: string;
  };

  if (!text?.trim() || !languageCode) {
    res.status(400).json({ error: 'text and languageCode are required.' });
    return;
  }

  try {
    let speechText = text.trim();

    // Translate into the selected language before generating speech.
    if (!languageCode.toLowerCase().startsWith('en')) {
      const translation = await translateTextWithGemini(
        speechText,
        languageCode
      );

      if (translation.isFallback || !translation.translatedText?.trim()) {
        res.status(503).json({
          error: `Translation failed for ${languageCode}.`,
          fallbackToBrowser: false,
          languageCode,
        });
        return;
      }

      speechText = translation.translatedText.trim();
    }

    const result = await synthesizeSpeech({
      text: speechText,
      languageCode,
      voicePreference,
    });

    if (!result.ok) {
      res.status(result.status).json({
        error: result.error,
        fallbackToBrowser: result.fallbackToBrowser,
        languageCode,
      });
      return;
    }

    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('X-Voice-Provider', result.provider);
    res.setHeader('X-Voice-Used', result.voiceUsed);
    res.setHeader('Cache-Control', 'no-store');
    res.send(result.audioBuffer);
  } catch (error) {
    console.error('Voice generation failed:', error);
    res.status(500).json({
      error: 'Could not translate or generate speech.',
      fallbackToBrowser: false,
      languageCode,
    });
  }
});

 

voiceRouter.post('/recognize', async (req: Request, res: Response) => {
  const { audioBase64, mimeType, languageCode } = req.body as {
    audioBase64?: string;
    mimeType?: string;
    languageCode?: string;
  };

  if (!audioBase64 || !languageCode) {
    res.status(400).json({ error: 'audioBase64 and languageCode are required.' });
    return;
  }

  const cleanB64 = audioBase64.includes(',') ? audioBase64.split(',')[1] : audioBase64;
  const approxBytes = Math.floor((cleanB64.length * 3) / 4);
  if (approxBytes > 10 * 1024 * 1024) {
    res.status(413).json({ error: 'Audio recording exceeds 10 MB limit.' });
    return;
  }

  const result = await recognizeSpeech({
    base64Audio: cleanB64,
    mimeType: mimeType || 'audio/webm',
    languageCode,
  });

  if (!result.ok) {
    res.status(503).json({
      ok: false,
      transcript: '',
      provider: result.provider,
      error: result.error || 'Speech transcription unavailable.',
    });
    return;
  }

  res.json(result);
});

voiceRouter.post('/translate', async (req: Request, res: Response) => {
  const { text, languageCode } = req.body as { text?: string; languageCode?: string };
  if (!text || !languageCode) {
    res.status(400).json({ error: 'text and languageCode are required.' });
    return;
  }
  const result = await translateTextWithGemini(text, languageCode);
  res.json(result);
});

voiceRouter.post('/assistant', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { question, fieldId, languageCode, sttProvider } = req.body as {
    question?: string;
    fieldId?: number | null;
    languageCode?: string;
    sttProvider?: string;
  };

  if (!question?.trim()) {
    res.status(400).json({ error: 'Question text is required.' });
    return;
  }

  const profile = db
    .prepare('SELECT full_name, preferred_language FROM farmer_profiles WHERE user_id = ?')
    .get(req.userId!) as { full_name: string; preferred_language: string } | undefined;

  const targetLang = languageCode || profile?.preferred_language || 'en-IN';

  let field: Record<string, unknown> | undefined;
  if (fieldId) {
    field = db
      .prepare('SELECT * FROM fields WHERE id = ? AND user_id = ?')
      .get(fieldId, req.userId!) as Record<string, unknown> | undefined;
  } else {
    field = db
      .prepare('SELECT * FROM fields WHERE user_id = ? ORDER BY is_preferred DESC, id ASC LIMIT 1')
      .get(req.userId!) as Record<string, unknown> | undefined;
  }

  let weatherSummary = 'No field selected or weather not fetched.';
  let forecastSummary = 'Unavailable';
  let waterSummary = 'No manual standing water measurements recorded.';
  let activeAlertsSummary = 'None';
  let recentScanSummary = 'None';
  let locationLabel = 'Not set';
  let cropName = 'Not selected';

  if (field) {
    const fId = Number(field.id);
    const crop = getCropById(String(field.crop_id));
    cropName = crop.name;
    locationLabel = [field.village_city, field.district, field.state_province, field.country]
      .filter(Boolean)
      .join(', ');

    const weather = await fetchWeather(
      Number(field.latitude),
      Number(field.longitude),
      String(field.timezone || 'auto')
    );

    if (weather.dataAvailable && weather.current) {
      weatherSummary = `Observed at ${weather.current.observedAt} (${weather.timezone}): Temp ${weather.current.temperatureC}°C, feels like ${weather.current.apparentTemperatureC}°C, humidity ${weather.current.humidityPercent}%, precipitation ${weather.current.precipitationMm} mm, wind ${weather.current.windSpeedKmh} km/h (${weather.current.weatherLabel}).`;
      forecastSummary = weather.daily
        .slice(0, 5)
        .map(
          (d) =>
            `${d.date}: ${d.tempMinC}–${d.tempMaxC}°C, rain ${d.precipitationSumMm}mm (${d.rainProbabilityMaxPercent ?? 0}%)`
        )
        .join(' | ');
    } else {
      weatherSummary = `Weather unavailable for this location (${weather.errorMessage || 'provider error'}).`;
    }

    const latestWater = db
      .prepare('SELECT standing_water_cm, measured_at FROM water_measurements WHERE field_id = ? ORDER BY measured_at DESC LIMIT 1')
      .get(fId) as { standing_water_cm: number; measured_at: string } | undefined;
    if (latestWater) {
      waterSummary = `${latestWater.standing_water_cm.toFixed(1)} cm standing water (MANUAL entry on ${latestWater.measured_at})`;
    }

    const alerts = db
      .prepare('SELECT severity, title FROM alerts WHERE field_id = ? ORDER BY id DESC LIMIT 3')
      .all(fId) as Array<{ severity: string; title: string }>;
    if (alerts.length > 0) {
      activeAlertsSummary = alerts.map((a) => `[${a.severity}] ${a.title}`).join('; ');
    }

    const scan = db
      .prepare('SELECT identified_crop, uncertainty_note FROM crop_scans WHERE field_id = ? ORDER BY id DESC LIMIT 1')
      .get(fId) as { identified_crop: string; uncertainty_note: string } | undefined;
    if (scan) {
      recentScanSummary = `${scan.identified_crop} — ${scan.uncertainty_note}`;
    }
  }

  const reply = await generateAgriAssistantReply({
    question: question.trim(),
    languageCode: targetLang,
    context: {
      farmerName: profile?.full_name,
      fieldName: field ? String(field.name) : undefined,
      locationLabel,
      country: field ? String(field.country) : undefined,
      region: field ? String(field.state_province) : undefined,
      cropName,
      growthStage: field ? String(field.growth_stage) : undefined,
      soilType: field ? String(field.soil_type) : undefined,
      irrigationMethod: field ? String(field.irrigation_method) : undefined,
      weatherSummary,
      forecastSummary,
      waterSummary,
      activeAlertsSummary,
      recentScanSummary,
    },
  });

  db.prepare(
    `INSERT INTO voice_interactions (user_id, field_id, language_code, question_text, answer_text, stt_provider, ai_provider)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    req.userId!,
    field ? Number(field.id) : null,
    targetLang,
    question.trim(),
    reply.answer,
    sttProvider || 'text',
    reply.provider
  );

  res.json({
    answer: reply.answer,
    languageCode: targetLang,
    provider: reply.provider,
    isFallback: reply.isFallback,
    aiError: reply.error,
    fieldUsed: field ? { id: field.id, name: field.name, locationLabel } : null,
  });
});

// Notifications / SMS
notificationsRouter.post('/send', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { fieldId, recipientPhone, languageCode, message, consentConfirmed } = req.body as {
    fieldId?: number | null;
    recipientPhone?: string;
    languageCode?: string;
    message?: string;
    consentConfirmed?: boolean;
  };

  if (!message?.trim()) {
    res.status(400).json({ error: 'Notification message text is required.' });
    return;
  }

  const user = db.prepare('SELECT phone FROM users WHERE id = ?').get(req.userId!) as
    | { phone: string | null }
    | undefined;
  const profile = db
    .prepare('SELECT preferred_language, sms_consent FROM farmer_profiles WHERE user_id = ?')
    .get(req.userId!) as { preferred_language: string; sms_consent: number } | undefined;

  const phone = recipientPhone?.trim() || user?.phone || '';
  const hasConsent = Boolean(consentConfirmed) || Boolean(profile?.sms_consent === 1);
  const lang = languageCode || profile?.preferred_language || 'en-IN';

  try {
    const result = await sendSmsNotification({
      userId: req.userId!,
      fieldId: fieldId ?? null,
      recipientPhone: phone,
      languageCode: lang,
      rawMessage: message.trim(),
      hasConsent,
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'SMS send failed.' });
  }
});

notificationsRouter.get('/history', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const rows = db
    .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50')
    .all(req.userId!);
  res.json({
    twilioConfigured: isTwilioConfigured(),
    notifications: rows,
  });
});
