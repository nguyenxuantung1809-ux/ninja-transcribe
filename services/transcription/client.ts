import type { SourceKind, TranscriptResult } from '@/types/transcript';

export async function transcribeFile(file: File, sourceKind: Exclude<SourceKind, 'youtube'>): Promise<TranscriptResult> {
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('sourceKind', sourceKind);
  const response = await fetch('/api/transcribe', { method: 'POST', body: form });
  const body = await response.json().catch(() => ({ error: 'The server returned an unreadable response.' }));
  if (!response.ok) throw new Error(body.error || 'Transcription failed. Please try again.');
  return body as TranscriptResult;
}
