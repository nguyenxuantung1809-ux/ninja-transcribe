import type { TranscriptResult } from '@/types/transcript';
import { formatSrtTimestamp, formatTimestamp } from './format';

function speakerPrefix(speaker?: string) {
  return speaker ? `Speaker ${speaker}: ` : '';
}

export function toTxt(result: TranscriptResult): string {
  return result.segments.map((segment) => `[${formatTimestamp(segment.start, result.duration >= 3600)}] ${speakerPrefix(segment.speaker)}${segment.text}`).join('\n\n');
}

export function toSrt(result: TranscriptResult): string {
  return result.segments.map((segment, index) => `${index + 1}\n${formatSrtTimestamp(segment.start)} --> ${formatSrtTimestamp(segment.end)}\n${speakerPrefix(segment.speaker)}${segment.text}`).join('\n\n');
}

export function toVtt(result: TranscriptResult): string {
  return `WEBVTT\n\n${result.segments.map((segment) => `${formatSrtTimestamp(segment.start).replace(',', '.')} --> ${formatSrtTimestamp(segment.end).replace(',', '.')}\n${speakerPrefix(segment.speaker)}${segment.text}`).join('\n\n')}`;
}

export function downloadText(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function safeBaseName(name: string): string {
  return (name.replace(/\.[^/.]+$/, '') || 'transcript').replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-|-$/g, '') || 'transcript';
}
