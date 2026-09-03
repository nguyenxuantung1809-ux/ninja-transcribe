import type { TranscriptResult, TranscriptSegment } from '@/types/transcript';

type CaptionTrack = { baseUrl?: string; languageCode?: string; name?: { simpleText?: string; runs?: Array<{ text?: string }> } };

const YOUTUBE_HEADERS = {
  'Accept-Language': 'en-US,en;q=0.9',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36',
};

const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function getVideoId(input: string): string | null {
  try {
    const url = new URL(input.trim());
    const host = url.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return /^[\w-]{11}$/.test(url.pathname.slice(1)) ? url.pathname.slice(1) : null;
    if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
      const id = url.searchParams.get('v') || url.pathname.match(/\/(?:shorts|embed)\/([\w-]{11})/)?.[1];
      return id && /^[\w-]{11}$/.test(id) ? id : null;
    }
  } catch { return null; }
  return null;
}

function extractJsonArray(html: string, marker: string): string | null {
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) return null;
  const start = html.indexOf('[', markerIndex + marker.length);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < html.length; index += 1) {
    const char = html[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === '[') depth += 1;
    else if (char === ']' && --depth === 0) return html.slice(start, index + 1);
  }
  return null;
}

function decodeEntities(value: string): string {
  return value.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<[^>]+>/g, '').trim();
}

function trackName(track: CaptionTrack): string {
  return track.name?.simpleText || track.name?.runs?.map((part) => part.text || '').join('') || track.languageCode || 'Auto-detected';
}

function titleFromHtml(html: string): string {
  const match = html.match(/<meta\s+name="title"\s+content="([^"]+)"/i) || html.match(/<title>(.*?)\s*-\s*YouTube<\/title>/i);
  return decodeEntities(match?.[1] || 'YouTube video');
}

export async function fetchYouTubeCaptions(input: string): Promise<TranscriptResult> {
  const videoId = getVideoId(input);
  if (!videoId) throw new Error('INVALID_URL');
  const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
  let html = '';
  let lastWatchError = 'YOUTUBE_ERROR';
  const watchUrls = [`${canonicalUrl}&hl=en`, `https://m.youtube.com/watch?v=${videoId}&hl=en`];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const watch = await fetch(watchUrls[Math.min(attempt, watchUrls.length - 1)], {
        cache: 'no-store',
        headers: YOUTUBE_HEADERS,
        signal: AbortSignal.timeout(12_000),
      });
      if (watch.status === 404) throw new Error('UNAVAILABLE');
      if (!watch.ok) {
        lastWatchError = `YOUTUBE_HTTP_${watch.status}`;
      } else {
        html = await watch.text();
        if (html.includes('"captionTracks":')) break;
        lastWatchError = 'NO_CAPTIONS';
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'UNAVAILABLE') throw error;
      lastWatchError = error instanceof DOMException && error.name === 'TimeoutError' ? 'YOUTUBE_TIMEOUT' : 'YOUTUBE_ERROR';
    }
    if (attempt < 2) await pause(250 * (attempt + 1));
  }
  if (!html) throw new Error(lastWatchError);
  if (/"playabilityStatus"\s*:\s*\{\s*"status"\s*:\s*"(?:LOGIN_REQUIRED|UNPLAYABLE|ERROR)"/.test(html)) throw new Error('UNAVAILABLE');
  const rawTracks = extractJsonArray(html, '"captionTracks":');
  if (!rawTracks) throw new Error('NO_CAPTIONS');

  let tracks: CaptionTrack[];
  try { tracks = JSON.parse(rawTracks) as CaptionTrack[]; } catch { throw new Error('NO_CAPTIONS'); }
  const track = tracks.find((item) => item.languageCode === 'vi') || tracks.find((item) => item.languageCode === 'en') || tracks[0];
  if (!track?.baseUrl) throw new Error('NO_CAPTIONS');
  const captionUrl = new URL(track.baseUrl);
  captionUrl.searchParams.set('fmt', 'json3');
  let body: { events?: Array<{ tStartMs?: number; dDurationMs?: number; segs?: Array<{ utf8?: string }> }> } | null = null;
  for (let attempt = 0; attempt < 3 && !body?.events?.length; attempt += 1) {
    try {
      const captions = await fetch(captionUrl, { cache: 'no-store', headers: YOUTUBE_HEADERS, signal: AbortSignal.timeout(12_000) });
      if (captions.ok) body = await captions.json().catch(() => null) as typeof body;
    } catch { /* The backend remains the mandatory fallback after retries. */ }
    if (!body?.events?.length && attempt < 2) await pause(250 * (attempt + 1));
  }
  const segments: TranscriptSegment[] = (body?.events || []).flatMap((event, index) => {
    const text = event.segs?.map((segment) => segment.utf8 || '').join('').replace(/\s+/g, ' ').trim();
    if (!text) return [];
    const start = Number(event.tStartMs || 0) / 1000;
    const end = start + Math.max(Number(event.dDurationMs || 0) / 1000, 1);
    return [{ id: `yt-${index + 1}`, start, end, text }];
  });
  if (!segments.length) throw new Error('NO_CAPTIONS');
  return {
    text: segments.map((segment) => segment.text).join(' '),
    language: trackName(track),
    duration: Math.max(...segments.map((segment) => segment.end)),
    sourceName: titleFromHtml(html),
    sourceKind: 'youtube',
    youtubeUrl: canonicalUrl,
    segments,
    speakersDetected: false,
  };
}
