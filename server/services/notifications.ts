import { db } from '../db.ts';
import { translateTextWithGemini } from './gemini.ts';

export interface SmsSendResult {
  id: number;
  status: 'QUEUED' | 'SENT' | 'DELIVERED' | 'FAILED' | 'DEMO_MODE';
  mode: 'LIVE_TWILIO' | 'DEMO';
  languageCode: string;
  translatedMessage: string;
  providerRef: string;
  errorMessage: string;
}

export function isTwilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_AUTH_TOKEN?.trim() &&
      process.env.TWILIO_FROM_NUMBER?.trim()
  );
}

export async function sendSmsNotification(params: {
  userId: number;
  fieldId?: number | null;
  recipientPhone: string;
  languageCode: string;
  rawMessage: string;
  hasConsent: boolean;
}): Promise<SmsSendResult> {
  if (!params.hasConsent) {
    throw new Error('SMS notification consent is required before dispatching messages.');
  }
  const phone = params.recipientPhone.trim();
  if (!phone || phone.length < 7) {
    throw new Error('A valid recipient phone number with country code is required.');
  }

  const { translatedText } = await translateTextWithGemini(params.rawMessage, params.languageCode);
  const messageToSend = translatedText || params.rawMessage;

  if (isTwilioConfigured()) {
    const sid = process.env.TWILIO_ACCOUNT_SID!.trim();
    const token = process.env.TWILIO_AUTH_TOKEN!.trim();
    const from = process.env.TWILIO_FROM_NUMBER!.trim();

    const insertQueued = db.prepare(`
      INSERT INTO notifications (user_id, field_id, channel, recipient, language_code, message_text, status, mode)
      VALUES (?, ?, 'SMS', ?, ?, ?, 'QUEUED', 'LIVE_TWILIO')
    `);
    const rowInfo = insertQueued.run(
      params.userId,
      params.fieldId ?? null,
      phone,
      params.languageCode,
      messageToSend
    );
    const notifId = Number(rowInfo.lastInsertRowid);

    try {
      const form = new URLSearchParams();
      form.set('To', phone);
      form.set('From', from);
      form.set('Body', messageToSend.slice(0, 1500));

      const authHeader = Buffer.from(`${sid}:${token}`).toString('base64');
      const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      });

      const body = (await resp.json()) as { sid?: string; status?: string; message?: string };
      if (!resp.ok) {
        const errMsg = body.message || `Twilio returned HTTP ${resp.status}`;
        db.prepare(`UPDATE notifications SET status = 'FAILED', error_message = ? WHERE id = ?`).run(
          errMsg,
          notifId
        );
        return {
          id: notifId,
          status: 'FAILED',
          mode: 'LIVE_TWILIO',
          languageCode: params.languageCode,
          translatedMessage: messageToSend,
          providerRef: '',
          errorMessage: errMsg,
        };
      }

      const finalStatus = body.status === 'delivered' ? 'DELIVERED' : 'SENT';
      db.prepare(`UPDATE notifications SET status = ?, provider_ref = ? WHERE id = ?`).run(
        finalStatus,
        body.sid || '',
        notifId
      );

      return {
        id: notifId,
        status: finalStatus,
        mode: 'LIVE_TWILIO',
        languageCode: params.languageCode,
        translatedMessage: messageToSend,
        providerRef: body.sid || '',
        errorMessage: '',
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'SMS network dispatch failed';
      db.prepare(`UPDATE notifications SET status = 'FAILED', error_message = ? WHERE id = ?`).run(
        errMsg,
        notifId
      );
      return {
        id: notifId,
        status: 'FAILED',
        mode: 'LIVE_TWILIO',
        languageCode: params.languageCode,
        translatedMessage: messageToSend,
        providerRef: '',
        errorMessage: errMsg,
      };
    }
  }

  // Clearly labelled Demo Mode when SMS provider credentials are unavailable
  const insertDemo = db.prepare(`
    INSERT INTO notifications (user_id, field_id, channel, recipient, language_code, message_text, status, mode, provider_ref)
    VALUES (?, ?, 'SMS', ?, ?, ?, 'DEMO_MODE', 'DEMO', ?)
  `);
  const ref = `DEMO-${Date.now()}`;
  const info = insertDemo.run(
    params.userId,
    params.fieldId ?? null,
    phone,
    params.languageCode,
    messageToSend,
    ref
  );

  return {
    id: Number(info.lastInsertRowid),
    status: 'DEMO_MODE',
    mode: 'DEMO',
    languageCode: params.languageCode,
    translatedMessage: messageToSend,
    providerRef: ref,
    errorMessage: '',
  };
}
