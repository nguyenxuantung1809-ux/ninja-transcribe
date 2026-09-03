import { getYouTubeBackendHealth } from '@/server/youtube/backend';

export const runtime = 'edge';

export async function GET() {
  const youtube = await getYouTubeBackendHealth();
  const uploadTranscriptionConfigured = Boolean(process.env.OPENAI_API_KEY);
  return Response.json({
    ok: true,
    transcriptionConfigured: uploadTranscriptionConfigured || youtube.openaiConfigured,
    uploadTranscriptionConfigured,
    youtubeBackendAvailable: youtube.available,
    youtubeTranscriptionConfigured: youtube.available && youtube.openaiConfigured,
  });
}
