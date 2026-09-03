import type { TranscriptResult, TranscriptSegment } from '@/types/transcript';
import { formatTimestamp } from './format';

export type TranscriptView = 'full' | 'timestamped';

const PARAGRAPH_TARGET = 560;
const PARAGRAPH_HARD_LIMIT = 900;

function cleanSegmentText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function endsSentence(text: string): boolean {
  return /[.!?]["')\]]*$/.test(text);
}

export function fullTranscriptParagraphs(segments: TranscriptSegment[]): string[] {
  const paragraphs: string[] = [];
  let current = '';

  for (const segment of segments) {
    const text = cleanSegmentText(segment.text);
    if (!text) continue;

    current = current ? `${current} ${text}` : text;
    if ((current.length >= PARAGRAPH_TARGET && endsSentence(text)) || current.length >= PARAGRAPH_HARD_LIMIT) {
      paragraphs.push(current);
      current = '';
    }
  }

  if (current) paragraphs.push(current);
  return paragraphs;
}

export function fullTranscriptText(result: TranscriptResult): string {
  return fullTranscriptParagraphs(result.segments).join('\n\n');
}

export function timestampedTranscriptText(result: TranscriptResult): string {
  const showHours = result.duration >= 3600;
  return result.segments.map((segment) => {
    const speaker = segment.speaker ? `Speaker ${segment.speaker}\n` : '';
    return `${formatTimestamp(segment.start, showHours)}\n${speaker}${cleanSegmentText(segment.text)}`;
  }).join('\n\n');
}

