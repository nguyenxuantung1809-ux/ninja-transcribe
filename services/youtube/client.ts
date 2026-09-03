import type { TranscriptResult } from '@/types/transcript';

export type YouTubeStage = 'reading_video' | 'downloading_audio' | 'converting_audio' | 'transcribing' | 'completed';

type JobResponse = {
  jobId?: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  stage: YouTubeStage;
  progress: number;
  message?: string;
  result?: TranscriptResult;
  error?: string | { code?: string; message?: string };
};

export function isYouTubeUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.replace(/^www\./, '');
    let videoId: string | null | undefined;
    if (host === 'youtu.be') videoId = url.pathname.split('/').filter(Boolean)[0];
    else if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
      videoId = url.pathname === '/watch' ? url.searchParams.get('v') : url.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{11})/)?.[1];
    }
    return Boolean(videoId && /^[\w-]{11}$/.test(videoId));
  } catch { return false; }
}

function errorMessage(body: { error?: JobResponse['error'] }, fallback: string) {
  if (typeof body.error === 'string') return body.error;
  return body.error?.message || fallback;
}

async function readResponse(response: Response): Promise<JobResponse> {
  const body = await response.json().catch(() => ({ error: 'The server returned an unreadable response.' })) as JobResponse;
  if (!response.ok) throw new Error(errorMessage(body, 'YouTube transcription could not be started.'));
  return body;
}

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export async function transcribeYouTube(url: string, onProgress?: (progress: number, stage: YouTubeStage) => void): Promise<TranscriptResult> {
  onProgress?.(7, 'reading_video');
  const response = await fetch('/api/youtube', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
  let job = await readResponse(response);
  if (job.status === 'completed' && job.result) return job.result;
  if (!job.jobId) throw new Error('The transcription server did not return a job ID.');

  const deadline = Date.now() + 2 * 60 * 60 * 1000;
  while (Date.now() < deadline) {
    onProgress?.(job.progress, job.stage);
    if (job.status === 'failed') throw new Error(errorMessage(job, 'YouTube transcription failed.'));
    if (job.status === 'completed' && job.result) return job.result;
    await delay(1_500);
    job = await readResponse(await fetch(`/api/youtube/${job.jobId}`, { cache: 'no-store' }));
  }
  throw new Error('The YouTube transcription job timed out after two hours.');
}
