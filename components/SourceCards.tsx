import type { SourceKind } from '@/types/transcript';

const sources: Array<{ id: SourceKind; number: string; icon: string; eyebrow: string; title: string; copy: string; action: string }> = [
  { id: 'video', number: '01', icon: '▶', eyebrow: 'MOVING IMAGE', title: 'Upload Video', copy: 'MP4, MOV, MKV, AVI, WebM or M4V', action: 'SELECT VIDEO' },
  { id: 'audio', number: '02', icon: '◉', eyebrow: 'VOICE RECORD', title: 'Upload Audio', copy: 'MP3, WAV, M4A, AAC, FLAC or OGG', action: 'SELECT AUDIO' },
  { id: 'youtube', number: '03', icon: '↗', eyebrow: 'REMOTE SCROLL', title: 'YouTube Link', copy: 'Paste a public YouTube URL', action: 'PASTE LINK' },
];

export function SourceCards({ active, onSelect }: { active: SourceKind | null; onSelect: (source: SourceKind) => void }) {
  return (
    <section className="source-grid" aria-label="Choose a transcription source">
      {sources.map((source) => (
        <button className={`source-card ${source.id} ${active === source.id ? 'active' : ''}`} key={source.id} type="button" onClick={() => onSelect(source.id)} aria-pressed={active === source.id}>
          <span className="card-number">{source.number}</span>
          <span className="icon-wrap" aria-hidden="true"><span>{source.icon}</span></span>
          <span className="card-eyebrow">{source.eyebrow}</span><strong>{source.title}</strong>
          <span className="card-copy">{source.copy}</span>
          <span className="card-action">{source.action} <b>→</b></span>
          <i className="corner top-left" /><i className="corner bottom-right" />
        </button>
      ))}
    </section>
  );
}
