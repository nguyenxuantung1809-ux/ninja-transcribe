import { transcribeWithOpenAI } from '@/server/transcription/openai';

export const runtime = 'edge';

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    const sourceKind = form.get('sourceKind') === 'video' ? 'video' : 'audio';
    if (!(file instanceof File)) return Response.json({ error: 'No media file was received.' }, { status: 400 });
    if (file.size === 0) return Response.json({ error: 'The uploaded file is empty or damaged.' }, { status: 400 });
    if (file.size > 100 * 1024 * 1024) return Response.json({ error: 'This file is over the 100 MB hosted limit. Upload a compressed or audio-only version.' }, { status: 413 });
    const result = await transcribeWithOpenAI(file, sourceKind);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected transcription error.';
    if (message === 'CONFIG_MISSING') return Response.json({ error: 'Transcription is ready, but the server still needs an OPENAI_API_KEY.' }, { status: 503 });
    if (error instanceof DOMException && error.name === 'TimeoutError') return Response.json({ error: 'The transcription request timed out. Try a shorter or compressed file.' }, { status: 504 });
    return Response.json({ error: message }, { status: 500 });
  }
}
