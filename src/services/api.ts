const TOKEN_STORAGE_KEY = 'agroalert_auth_token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore storage restriction
  }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(path, {
    ...options,
    headers,
    credentials: 'include',
  });

  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    if (contentType.includes('application/json')) {
      const errBody = (await response.json()) as { error?: string };
      if (errBody?.error) message = errBody.error;
    } else {
      const txt = await response.text();
      if (txt) message = txt.slice(0, 200);
    }
    throw new Error(message);
  }

  if (contentType.includes('application/json')) {
    return (await response.json()) as T;
  }
  return (await response.text()) as unknown as T;
}

export async function apiFetchAudio(params: {
  text: string;
  languageCode: string;
  voicePreference?: string;
}): Promise<
  | { ok: true; blobUrl: string; provider: string; voiceUsed: string; mimeType: string }
  | { ok: false; fallbackToBrowser: boolean; error: string }
> {
  const token = getStoredToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const resp = await fetch('/api/voice/generate', {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify(params),
  });

  if (!resp.ok) {
    try {
      const data = (await resp.json()) as { error?: string; fallbackToBrowser?: boolean };
      return {
        ok: false,
        fallbackToBrowser: Boolean(data.fallbackToBrowser),
        error: data.error || `TTS error (${resp.status})`,
      };
    } catch {
      return {
        ok: false,
        fallbackToBrowser: true,
        error: `Speech generation returned HTTP ${resp.status}`,
      };
    }
  }

  const blob = await resp.blob();
  const blobUrl = URL.createObjectURL(blob);
  return {
    ok: true,
    blobUrl,
    provider: resp.headers.get('X-Voice-Provider') || 'server-tts',
    voiceUsed: resp.headers.get('X-Voice-Used') || 'default',
    mimeType: blob.type || resp.headers.get('Content-Type') || 'audio/wav',
  };
}
