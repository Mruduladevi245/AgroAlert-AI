import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { db } from './db.ts';

const SESSION_SECRET =
  process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16
    ? process.env.SESSION_SECRET
    : crypto.createHash('sha256').update(process.cwd() + '_agroalert_dev_key').digest('hex');

export const SESSION_COOKIE_NAME = 'agroalert_session';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derived = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derived.length) return false;
  return crypto.timingSafeEqual(keyBuf, derived);
}

export interface SessionPayload {
  userId: number;
  exp: number;
}

export function createSessionToken(userId: number, rememberMe = true): string {
  const ttlSeconds = rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 24;
  const payload: SessionPayload = {
    userId,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed.userId || !parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  const pairs = header.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    if (key === name) {
      return decodeURIComponent(pair.slice(idx + 1).trim());
    }
  }
  return null;
}

export interface AuthenticatedRequest extends Request {
  userId?: number;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  let token: string | null = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }
  if (!token) {
    token = parseCookie(req.headers.cookie, SESSION_COOKIE_NAME);
  }
  if (!token) {
    res.status(401).json({ error: 'Authentication required. Please log in.' });
    return;
  }
  const payload = verifySessionToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
    return;
  }
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(payload.userId) as { id: number } | undefined;
  if (!user) {
    res.status(401).json({ error: 'Account not found.' });
    return;
  }
  req.userId = user.id;
  next();
}

export function getRpConfig(req: Request): { rpID: string; origin: string; rpName: string } {
  const hostHeader = (req.headers['x-forwarded-host'] as string) || req.headers.host || 'localhost:3000';
  const hostname = hostHeader.split(':')[0].trim();
  const proto = (req.headers['x-forwarded-proto'] as string) || (hostname === 'localhost' ? 'http' : 'https');
  const rpID = process.env.WEBAUTHN_RP_ID || hostname;
  const origin = process.env.WEBAUTHN_ORIGIN || `${proto}://${hostHeader}`;
  return { rpID, origin, rpName: 'AgroAlert AI' };
}

export async function createWebAuthnRegistration(req: Request, userId: number, identifier: string) {
  const { rpID, rpName } = getRpConfig(req);
  const existing = db
    .prepare('SELECT id, transports_json FROM passkey_credentials WHERE user_id = ?')
    .all(userId) as Array<{ id: string; transports_json: string }>;

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: identifier,
    userDisplayName: identifier,
    attestationType: 'none',
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'preferred',
      residentKey: 'preferred',
    },
    excludeCredentials: existing.map((cred) => ({
      id: cred.id,
      transports: JSON.parse(cred.transports_json),
    })),
  });

  db.prepare(
    `INSERT INTO auth_challenges (challenge, purpose, user_id, identifier, expires_at)
     VALUES (?, 'webauthn_register', ?, ?, datetime('now', '+5 minutes'))`
  ).run(options.challenge, userId, identifier);

  return options;
}

export async function verifyWebAuthnRegistration(
  req: Request,
  userId: number,
  body: RegistrationResponseJSON,
  deviceLabel?: string
) {
  const { rpID, origin } = getRpConfig(req);
  const row = db
    .prepare(
      `SELECT id, challenge FROM auth_challenges
       WHERE user_id = ? AND purpose = 'webauthn_register' AND expires_at > datetime('now')
       ORDER BY id DESC LIMIT 1`
    )
    .get(userId) as { id: number; challenge: string } | undefined;

  if (!row) {
    throw new Error('Registration challenge expired or missing.');
  }

  const verification = await verifyRegistrationResponse({
    response: body,
    expectedChallenge: row.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: false,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error('Biometric passkey verification failed.');
  }

  const { credential } = verification.registrationInfo;
  const publicKeyB64 = Buffer.from(credential.publicKey).toString('base64url');
  const transports = JSON.stringify(body.response?.transports ?? ['internal']);

  db.prepare(
    `INSERT OR REPLACE INTO passkey_credentials (id, user_id, public_key, counter, transports_json, device_label)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    credential.id,
    userId,
    publicKeyB64,
    credential.counter,
    transports,
    deviceLabel || 'Device Biometric Face Unlock'
  );

  db.prepare('DELETE FROM auth_challenges WHERE id = ?').run(row.id);
  return { verified: true, credentialId: credential.id };
}

export async function createWebAuthnAuthentication(req: Request, identifier: string) {
  const { rpID } = getRpConfig(req);
  const user = db
    .prepare('SELECT id FROM users WHERE lower(email) = lower(?) OR phone = ?')
    .get(identifier.trim(), identifier.trim()) as { id: number } | undefined;

  if (!user) {
    throw new Error('No account found for this email or phone.');
  }

  const creds = db
    .prepare('SELECT id, transports_json FROM passkey_credentials WHERE user_id = ?')
    .all(user.id) as Array<{ id: string; transports_json: string }>;

  if (creds.length === 0) {
    throw new Error('Face unlock / passkey is not yet registered for this account. Please log in with password and enroll in Profile & SMS.');
  }

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'preferred',
    allowCredentials: creds.map((c) => ({
      id: c.id,
      transports: JSON.parse(c.transports_json),
    })),
  });

  db.prepare(
    `INSERT INTO auth_challenges (challenge, purpose, user_id, identifier, expires_at)
     VALUES (?, 'webauthn_login', ?, ?, datetime('now', '+5 minutes'))`
  ).run(options.challenge, user.id, identifier.trim());

  return options;
}

export async function verifyWebAuthnAuthentication(
  req: Request,
  identifier: string,
  body: AuthenticationResponseJSON
) {
  const { rpID, origin } = getRpConfig(req);
  const user = db
    .prepare('SELECT id FROM users WHERE lower(email) = lower(?) OR phone = ?')
    .get(identifier.trim(), identifier.trim()) as { id: number } | undefined;

  if (!user) {
    throw new Error('Account not found.');
  }

  const challengeRow = db
    .prepare(
      `SELECT id, challenge FROM auth_challenges
       WHERE user_id = ? AND purpose = 'webauthn_login' AND expires_at > datetime('now')
       ORDER BY id DESC LIMIT 1`
    )
    .get(user.id) as { id: number; challenge: string } | undefined;

  if (!challengeRow) {
    throw new Error('Authentication challenge expired or missing.');
  }

  const credRow = db
    .prepare('SELECT id, public_key, counter, transports_json FROM passkey_credentials WHERE id = ? AND user_id = ?')
    .get(body.id, user.id) as
    | { id: string; public_key: string; counter: number; transports_json: string }
    | undefined;

  if (!credRow) {
    throw new Error('Passkey credential not recognized for this account.');
  }

  const verification = await verifyAuthenticationResponse({
    response: body,
    expectedChallenge: challengeRow.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: false,
    credential: {
      id: credRow.id,
      publicKey: new Uint8Array(Buffer.from(credRow.public_key, 'base64url')),
      counter: credRow.counter,
      transports: JSON.parse(credRow.transports_json),
    },
  });

  if (!verification.verified) {
    throw new Error('Biometric verification failed.');
  }

  db.prepare('UPDATE passkey_credentials SET counter = ? WHERE id = ?').run(
    verification.authenticationInfo.newCounter,
    credRow.id
  );
  db.prepare('DELETE FROM auth_challenges WHERE id = ?').run(challengeRow.id);

  return { userId: user.id };
}
