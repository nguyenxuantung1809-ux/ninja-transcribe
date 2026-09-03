export type SourceKind = 'video' | 'audio' | 'youtube';

export interface TranscriptSegment {
  id: string;
  start: number;
  end: number;
  text: string;
  speaker?: string;
}

export interface TranscriptResult {
  text: string;
  language: string;
  duration: number;
  sourceName: string;
  sourceKind: SourceKind;
  segments: TranscriptSegment[];
  mediaUrl?: string;
  youtubeUrl?: string;
  speakersDetected?: boolean;
}

export interface MediaDetails {
  name: string;
  size: number;
  type: string;
  duration: number | null;
}
