import type { SourceKind, TranscriptResult, TranscriptSegment } from '@/types/transcript';

const OPENAI_URL = 'https://api.openai.com/v1/audio/transcriptions';

type OpenAITranscription = {
  text?: string;
  language?: string;
  languages?: Array<{ code?: string }>;
  duration?: number;
  segments?: Array<{ id?: string | number; start?: number; end?: number; text?: string; speaker?: string }>;
  error?: { message?: string; code?: string };
};

function displayLanguage(text: string, declared?: string): string {
  const names: Record<string, string> = { vi: 'Vietnamese', en: 'English', ja: 'Japanese', ko: 'Korean', zh: 'Chinese', fr: 'French', de: 'German', es: 'Spanish', pt: 'Portuguese', ru: 'Russian', ar: 'Arabic', th: 'Thai', id: 'Indonesian' };
  if (declared) return names[declared.toLowerCase().split('-')[0]] || declared;
  if (/[ăâđêôơưĂÂĐÊÔƠƯ]/.test(text) || /[ạảãàáấầẩẫậắằẳẵặẹẻẽèéếềểễệịỉĩìíọỏõòóốồổỗộớờởỡợụủũùúứừửữựỵỷỹỳý]/i.test(text)) return 'Vietnamese';
  if (/[぀-ヿ]/.test(text)) return 'Japanese';
  if (/[가-힯]/.test(text)) return 'Korean';
  if (/[一-鿿]/.test(text)) return 'Chinese';
  if (/[Ѐ-ӿ]/.test(text)) return 'Russian';
  if (/[؀-ۿ]/.test(text)) return 'Arabic';
  if (/[฀-๿]/.test(text)) return 'Thai';
  return 'English';
}

function normalizeSegments(data: OpenAITranscription): TranscriptSegment[] {
  if (data.segments?.length) {
    return data.segments
      .filter((segment) => segment.text?.trim())
      .map((segment, index) => ({
        id: String(segment.id ?? `segment-${index + 1}`),
        start: Number(segment.start || 0),
        end: Number(segment.end ?? segment.start ?? 0),
        text: segment.text!.trim(),
        speaker: segment.speaker ? String(segment.speaker) : undefined,
      }));
  }
  const sentences = (data.text || '').split(/(?<=[.!?。！？])\s+/).filter(Boolean);
  const total = Math.max(Number(data.duration || 0), sentences.length * 5);
  return sentences.map((text, index) => ({ id: `segment-${index + 1}`, start: (index / sentences.length) * total, end: ((index + 1) / sentences.length) * total, text: text.trim() }));
}

function friendlyApiError(status: number, detail?: string): string {
  if (status === 401 || status === 403) return 'The transcription service is temporarily unavailable. Please try again later.';
  if (status === 413) return 'This media file is too large for the transcription service. Try an audio-only or compressed version.';
  if (status === 429) return 'The transcription service is busy right now. Please wait a moment and try again.';
  if (status >= 500) return 'The transcription service is temporarily unavailable. Please try again shortly.';
  if (detail?.toLowerCase().includes('format')) return 'This media format could not be decoded. Convert it to MP4, MP3, M4A, WAV or WebM and try again.';
  return detail ? `Transcription failed: ${detail}` : 'Transcription failed. Please try another file.';
}

async function makeRequest(file: File, apiKey: string, model: string): Promise<Response> {
  const form = new FormData();
  form.append('file', file, file.name.replace(/[^a-zA-Z0-9._-]+/g, '_'));
  form.append('model', model);
  if (model === 'gpt-4o-transcribe-diarize') {
    form.append('response_format', 'diarized_json');
    form.append('chunking_strategy', 'auto');
  } else if (model === 'whisper-1') {
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'segment');
  } else {
    form.append('response_format', 'json');
    form.append('chunking_strategy', 'auto');
  }
  return fetch(OPENAI_URL, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form, signal: AbortSignal.timeout(840_000) });
}

export async function transcribeWithOpenAI(file: File, sourceKind: Exclude<SourceKind, 'youtube'>): Promise<TranscriptResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('CONFIG_MISSING');
  const preferredModel = process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-transcribe-diarize';
  let response = await makeRequest(file, apiKey, preferredModel);
  let usedModel = preferredModel;

  if (!response.ok && preferredModel === 'gpt-4o-transcribe-diarize' && (response.status === 400 || response.status === 404)) {
    usedModel = 'whisper-1';
    response = await makeRequest(file, apiKey, usedModel);
  }

  const data = await response.json().catch(() => ({})) as OpenAITranscription;
  if (!response.ok) throw new Error(friendlyApiError(response.status, data.error?.message));
  if (!data.text?.trim()) throw new Error('No speech was detected in this file. Check that it contains audible dialogue.');

  const segments = normalizeSegments(data);
  const duration = Math.max(Number(data.duration || 0), ...segments.map((segment) => segment.end), 0);
  const declaredLanguage = data.language || data.languages?.[0]?.code;
  return {
    text: data.text.trim(),
    language: displayLanguage(data.text, declaredLanguage),
    duration,
    sourceName: file.name,
    sourceKind,
    segments,
    speakersDetected: usedModel === 'gpt-4o-transcribe-diarize' && segments.some((segment) => Boolean(segment.speaker)),
  };
}
