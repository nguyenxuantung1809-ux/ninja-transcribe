import type { MediaDetails, SourceKind } from '@/types/transcript';

export const VIDEO_EXTENSIONS = ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v'];
export const AUDIO_EXTENSIONS = ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'webm'];
export const MAX_FILE_BYTES = 100 * 1024 * 1024;

export function extensionOf(name: string): string {
  return name.split('.').pop()?.toLowerCase() || '';
}

export function validateMediaFile(file: File, kind: Exclude<SourceKind, 'youtube'>): string | null {
  const ext = extensionOf(file.name);
  const allowed = kind === 'video' ? VIDEO_EXTENSIONS : AUDIO_EXTENSIONS;
  if (!allowed.includes(ext)) return `Unsupported ${kind} format. Please choose ${allowed.map((item) => item.toUpperCase()).join(', ')}.`;
  if (file.size === 0) return 'This file is empty or damaged. Please choose another file.';
  if (file.size > MAX_FILE_BYTES) return 'This file is over the 100 MB limit for this hosted version. Compress it first or upload an audio-only export.';
  return null;
}

export async function readMediaDetails(file: File, kind: Exclude<SourceKind, 'youtube'>): Promise<MediaDetails> {
  const url = URL.createObjectURL(file);
  try {
    const duration = await new Promise<number | null>((resolve) => {
      const media = document.createElement(kind === 'video' ? 'video' : 'audio');
      const timer = window.setTimeout(() => resolve(null), 8000);
      media.preload = 'metadata';
      media.onloadedmetadata = () => { window.clearTimeout(timer); resolve(Number.isFinite(media.duration) ? media.duration : null); };
      media.onerror = () => { window.clearTimeout(timer); resolve(null); };
      media.src = url;
    });
    return { name: file.name, size: file.size, type: file.type || extensionOf(file.name).toUpperCase(), duration };
  } finally {
    URL.revokeObjectURL(url);
  }
}
