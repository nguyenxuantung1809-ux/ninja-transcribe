import { callYouTubeBackend, YouTubeBackendError } from '@/server/youtube/backend';

export const runtime = 'edge';

export async function GET(_: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) {
    return Response.json({ error: { code: 'INVALID_JOB_ID', message: 'The transcription job ID is invalid.' } }, { status: 400 });
  }
  try {
    return Response.json(await callYouTubeBackend(`/v1/youtube/jobs/${jobId}`));
  } catch (error) {
    if (error instanceof YouTubeBackendError) {
      return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    return Response.json({ error: { code: 'YOUTUBE_BACKEND_ERROR', message: 'The YouTube audio transcription backend could not be reached.' } }, { status: 502 });
  }
}
