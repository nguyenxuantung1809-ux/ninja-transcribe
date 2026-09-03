type BackendErrorBody = {
  error?: string | { code?: string; message?: string };
  detail?: string | { code?: string; message?: string };
};

export class YouTubeBackendError extends Error {
  constructor(public code: string, message: string, public status = 502) {
    super(message);
  }
}

function configuration() {
  const baseUrl = process.env.TRANSCRIPTION_BACKEND_URL?.trim().replace(/\/$/, '');
  if (!baseUrl) {
    throw new YouTubeBackendError(
      'YOUTUBE_BACKEND_NOT_CONFIGURED',
      'YouTube transcription is temporarily unavailable. Please try again shortly.',
      503,
    );
  }
  return { baseUrl, secret: process.env.BACKEND_SHARED_SECRET?.trim() };
}

function errorDetails(body: BackendErrorBody, fallback: string) {
  const detail = body.detail ?? body.error;
  if (typeof detail === 'string') return { code: 'YOUTUBE_BACKEND_ERROR', message: detail };
  return { code: detail?.code || 'YOUTUBE_BACKEND_ERROR', message: detail?.message || fallback };
}

export async function callYouTubeBackend(path: string, init?: RequestInit) {
  const { baseUrl, secret } = configuration();
  const headers = new Headers(init?.headers);
  if (secret) headers.set('Authorization', `Bearer ${secret}`);
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json().catch(() => ({})) as BackendErrorBody & Record<string, unknown>;
  if (!response.ok) {
    const detail = errorDetails(body, 'The YouTube transcription backend could not complete this request.');
    throw new YouTubeBackendError(detail.code, detail.message, response.status);
  }
  return body;
}

export async function getYouTubeBackendHealth() {
  try {
    const { baseUrl } = configuration();
    const response = await fetch(`${baseUrl}/health`, { cache: 'no-store', signal: AbortSignal.timeout(4_000) });
    if (!response.ok) return { available: false, openaiConfigured: false };
    const body = await response.json() as { openaiConfigured?: boolean };
    return { available: true, openaiConfigured: Boolean(body.openaiConfigured) };
  } catch {
    return { available: false, openaiConfigured: false };
  }
}
