import { fetchYouTubeCaptions } from '@/server/youtube/captions';

export const runtime = 'edge';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as { url?: string };
    if (!body.url) return Response.json({ error: 'Paste a YouTube URL first.' }, { status: 400 });
    return Response.json(await fetchYouTubeCaptions(body.url));
  } catch (error) {
    const code = error instanceof Error ? error.message : 'YOUTUBE_ERROR';
    if (code === 'INVALID_URL') return Response.json({ error: 'This is not a valid YouTube URL.' }, { status: 400 });
    if (code === 'UNAVAILABLE') return Response.json({ error: 'This YouTube video is private, restricted or unavailable. Upload the video/audio file instead.' }, { status: 422 });
    if (code === 'NO_CAPTIONS') return Response.json({ error: 'No accessible subtitles were found for this video. YouTube did not provide a lawful audio fallback, so please upload the video or audio file instead.' }, { status: 422 });
    return Response.json({ error: 'YouTube could not be reached right now. Please upload the video or audio file instead.' }, { status: 502 });
  }
}
