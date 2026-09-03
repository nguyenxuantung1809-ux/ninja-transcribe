import type { TranscriptResult } from '@/types/transcript';

export function isYouTubeUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.replace(/^www\./, '');
    return host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com');
  } catch { return false; }
}

export async function transcribeYouTube(url: string): Promise<TranscriptResult> {
  const response = await fetch('/api/youtube', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
  const body = await response.json().catch(() => ({ error: 'The server returned an unreadable response.' }));
  if (!response.ok) throw new Error(body.error || 'YouTube transcript could not be retrieved.');
  return body as TranscriptResult;
}
