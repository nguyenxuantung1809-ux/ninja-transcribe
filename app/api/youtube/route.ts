import { fetchYouTubeCaptions } from '@/server/youtube/captions';
import { callYouTubeBackend, YouTubeBackendError } from '@/server/youtube/backend';

export const runtime = 'edge';

export async function POST(request: Request) {
  let url = '';
  try {
    const body = await request.json().catch(() => ({})) as { url?: string };
    if (!body.url) return Response.json({ error: 'Paste a YouTube URL first.' }, { status: 400 });
    url = body.url;
    const result = await fetchYouTubeCaptions(url);
    return Response.json({ status: 'completed', stage: 'completed', progress: 100, message: 'Hoàn thành', result, fastPath: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'YOUTUBE_ERROR';
    if (code === 'INVALID_URL') return Response.json({ error: 'This is not a valid YouTube URL.' }, { status: 400 });

    // Missing, blocked, or ambiguous caption responses are intentionally not terminal.
    // The yt-dlp backend makes the authoritative availability check and starts audio fallback.
    try {
      const job = await callYouTubeBackend('/v1/youtube/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      return Response.json(job, { status: 202 });
    } catch (backendError) {
      if (backendError instanceof YouTubeBackendError) {
        return Response.json({ error: { code: backendError.code, message: backendError.message } }, { status: backendError.status });
      }
      return Response.json({ error: { code: 'YOUTUBE_BACKEND_ERROR', message: 'The YouTube audio transcription backend could not be reached.' } }, { status: 502 });
    }
  }
}
