import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import {
  createSessionToken,
  createWebAuthnAuthentication,
  createWebAuthnRegistration,
  hashPassword,
  requireAuth,
  SESSION_COOKIE_NAME,
  verifyPassword,
  verifyWebAuthnAuthentication,
  verifyWebAuthnRegistration,
  type AuthenticatedRequest,
} from '../auth.ts';
import { db } from '../db.ts';

export const authRouter = Router();

function setAuthCookie(res: Response, token: string, rememberMe = true): void {
  const maxAge = rememberMe ? 1000 * 60 * 60 * 24 * 30 : 1000 * 60 * 60 * 24;
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge,
    path: '/',
  });
}

function getUserPayload(userId: number) {
  const user = db
    .prepare('SELECT id, email, phone, created_at FROM users WHERE id = ?')
    .get(userId) as { id: number; email: string | null; phone: string | null; created_at: string } | undefined;
  const profile = db
    .prepare('SELECT * FROM farmer_profiles WHERE user_id = ?')
    .get(userId) as Record<string, unknown> | undefined;
  const passkeys = db
    .prepare('SELECT id, device_label, created_at FROM passkey_credentials WHERE user_id = ?')
    .all(userId) as Array<{ id: string; device_label: string; created_at: string }>;
  return { user, profile, passkeys };
}

authRouter.post('/register', (req: Request, res: Response) => {
  const body = req.body as {
    email?: string;
    phone?: string;
    password?: string;
    fullName?: string;
    country?: string;
    stateRegion?: string;
    district?: string;
    villageCity?: string;
    preferredLanguage?: string;
    farmName?: string;
    fieldName?: string;
    latitude?: number;
    longitude?: number;
    timezone?: string;
    cropId?: string;
    growthStage?: string;
  };

  const email = body.email?.trim().toLowerCase() || null;
  const phone = body.phone?.trim() || null;
  const password = body.password || '';
  const fullName = body.fullName?.trim() || 'Farmer';

  if (!email && !phone) {
    res.status(400).json({ error: 'Please provide an email address or phone number.' });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    return;
  }

  if (email) {
    const exists = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(email);
    if (exists) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }
  }
  if (phone) {
    const exists = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
    if (exists) {
      res.status(409).json({ error: 'An account with this phone number already exists.' });
      return;
    }
  }

  const passwordHash = hashPassword(password);
  const userRes = db
    .prepare('INSERT INTO users (email, phone, password_hash) VALUES (?, ?, ?)')
    .run(email, phone, passwordHash);
  const userId = Number(userRes.lastInsertRowid);

  const country = body.country?.trim() || '';
  const stateRegion = body.stateRegion?.trim() || '';
  const district = body.district?.trim() || '';
  const villageCity = body.villageCity?.trim() || '';
  const preferredLanguage = body.preferredLanguage?.trim() || 'en-IN';

  db.prepare(
    `INSERT INTO farmer_profiles (user_id, full_name, country, state_region, district, village_city, preferred_language)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(userId, fullName, country, stateRegion, district, villageCity, preferredLanguage);

  // Create initial farm
  const farmName = body.farmName?.trim() || `${fullName.split(' ')[0]}'s Farm`;
  const farmRes = db
    .prepare('INSERT INTO farms (user_id, name, country, region) VALUES (?, ?, ?, ?)')
    .run(userId, farmName, country, stateRegion);
  const farmId = Number(farmRes.lastInsertRowid);

  // Optionally create initial field if coordinates were chosen during registration
  if (
    typeof body.latitude === 'number' &&
    typeof body.longitude === 'number' &&
    Number.isFinite(body.latitude) &&
    Number.isFinite(body.longitude)
  ) {
    db.prepare(
      `INSERT INTO fields (
        user_id, farm_id, name, country, state_province, district, village_city,
        latitude, longitude, timezone, crop_id, growth_stage, is_preferred
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    ).run(
      userId,
      farmId,
      body.fieldName?.trim() || 'Primary Field',
      country,
      stateRegion,
      district,
      villageCity,
      body.latitude,
      body.longitude,
      body.timezone || 'auto',
      body.cropId || 'rice',
      body.growthStage || 'vegetative'
    );
  }

  const token = createSessionToken(userId, true);
  setAuthCookie(res, token, true);
  res.status(201).json({
    token,
    ...getUserPayload(userId),
  });
});

authRouter.post('/login', (req: Request, res: Response) => {
  const body = req.body as {
    identifier?: string;
    email?: string;
    phone?: string;
    password?: string;
    rememberMe?: boolean;
  };
  const identifier = (body.identifier || body.email || body.phone || '').trim();
  const password = body.password || '';

  if (!identifier || !password) {
    res.status(400).json({ error: 'Email/phone and password are required.' });
    return;
  }

  const user = db
    .prepare('SELECT id, password_hash FROM users WHERE lower(email) = lower(?) OR phone = ?')
    .get(identifier, identifier) as { id: number; password_hash: string } | undefined;

  if (!user || !verifyPassword(password, user.password_hash)) {
    res.status(401).json({ error: 'Invalid credentials. Please check your email/phone and password.' });
    return;
  }

  const rememberMe = body.rememberMe !== false;
  const token = createSessionToken(user.id, rememberMe);
  setAuthCookie(res, token, rememberMe);
  res.json({
    token,
    ...getUserPayload(user.id),
  });
});

authRouter.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  res.json(getUserPayload(req.userId!));
});

authRouter.post('/forgot-password', (req: Request, res: Response) => {
  const { identifier } = req.body as { identifier?: string };
  const clean = (identifier || '').trim();
  if (!clean) {
    res.status(400).json({ error: 'Please enter your registered email or phone.' });
    return;
  }
  const user = db
    .prepare('SELECT id FROM users WHERE lower(email) = lower(?) OR phone = ?')
    .get(clean, clean) as { id: number } | undefined;

  if (!user) {
    res.status(404).json({ error: 'No farmer account matches that email or phone.' });
    return;
  }

  const recoveryCode = String(crypto.randomInt(100000, 999999));
  db.prepare(
    `INSERT INTO auth_challenges (challenge, purpose, user_id, identifier, expires_at)
     VALUES (?, 'password_reset', ?, ?, datetime('now', '+15 minutes'))`
  ).run(recoveryCode, user.id, clean);

  // Note: When external email/SMS delivery is not configured, return a clear local verification demo notice.
  res.json({
    ok: true,
    deliveryMode: 'LOCAL_VERIFICATION_DEMO',
    message:
      'Password recovery code generated. Because no external email gateway is configured, enter this verification code to reset your password.',
    demoVerificationCode: recoveryCode,
  });
});

authRouter.post('/reset-password', (req: Request, res: Response) => {
  const { identifier, code, newPassword } = req.body as {
    identifier?: string;
    code?: string;
    newPassword?: string;
  };
  if (!identifier?.trim() || !code?.trim() || !newPassword || newPassword.length < 6) {
    res.status(400).json({ error: 'Identifier, recovery code, and a 6+ character password are required.' });
    return;
  }

  const user = db
    .prepare('SELECT id FROM users WHERE lower(email) = lower(?) OR phone = ?')
    .get(identifier.trim(), identifier.trim()) as { id: number } | undefined;
  if (!user) {
    res.status(404).json({ error: 'Account not found.' });
    return;
  }

  const row = db
    .prepare(
      `SELECT id FROM auth_challenges
       WHERE user_id = ? AND purpose = 'password_reset' AND challenge = ? AND expires_at > datetime('now')
       ORDER BY id DESC LIMIT 1`
    )
    .get(user.id, code.trim()) as { id: number } | undefined;

  if (!row) {
    res.status(400).json({ error: 'Invalid or expired recovery code.' });
    return;
  }

  db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(
    hashPassword(newPassword),
    user.id
  );
  db.prepare('DELETE FROM auth_challenges WHERE id = ?').run(row.id);

  res.json({ ok: true, message: 'Password updated successfully. You may now sign in.' });
});

// WebAuthn / Passkey Face Unlock Endpoints
authRouter.post('/webauthn/register-options', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = db
      .prepare('SELECT email, phone FROM users WHERE id = ?')
      .get(req.userId!) as { email: string | null; phone: string | null } | undefined;
    const identifier = user?.email || user?.phone || `farmer-${req.userId}`;
    const options = await createWebAuthnRegistration(req, req.userId!, identifier);
    res.json(options);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to start passkey registration.' });
  }
});

authRouter.post('/webauthn/register-verify', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { response, deviceLabel } = req.body as {
      response: Parameters<typeof verifyWebAuthnRegistration>[2];
      deviceLabel?: string;
    };
    const result = await verifyWebAuthnRegistration(req, req.userId!, response, deviceLabel);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Passkey registration failed.' });
  }
});

authRouter.post('/webauthn/login-options', async (req: Request, res: Response) => {
  try {
    const { identifier } = req.body as { identifier?: string };
    if (!identifier?.trim()) {
      res.status(400).json({ error: 'Enter your email or phone first to locate your registered passkey.' });
      return;
    }
    const options = await createWebAuthnAuthentication(req, identifier);
    res.json(options);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Passkey login unavailable.' });
  }
});

authRouter.post('/webauthn/login-verify', async (req: Request, res: Response) => {
  try {
    const { identifier, response } = req.body as {
      identifier: string;
      response: Parameters<typeof verifyWebAuthnAuthentication>[2];
    };
    const { userId } = await verifyWebAuthnAuthentication(req, identifier, response);
    const token = createSessionToken(userId, true);
    setAuthCookie(res, token, true);
    res.json({
      token,
      ...getUserPayload(userId),
    });
  } catch (err) {
    res.status(401).json({ error: err instanceof Error ? err.message : 'Biometric authentication failed.' });
  }
});
