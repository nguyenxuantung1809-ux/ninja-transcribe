'use client';

import { useMemo, useRef, useState } from 'react';
import type { TranscriptResult as Result } from '@/types/transcript';
import { formatTimestamp } from '@/utils/format';
import { safeBaseName } from '@/utils/transcript-export';
import { buildTranscriptDocx } from '@/utils/transcript-docx';
import { fullTranscriptParagraphs, fullTranscriptText, timestampedTranscriptText, type TranscriptView } from '@/utils/transcript-view';

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'ig'));
  return <>{parts.map((part, index) => part.toLowerCase() === query.toLowerCase() ? <mark key={index}>{part}</mark> : part)}</>;
}

function youtubeId(url?: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'youtu.be') return parsed.pathname.split('/').filter(Boolean)[0] ?? null;
    return parsed.searchParams.get('v');
  } catch { return null; }
}

export function TranscriptResult({ result, mediaUrl }: { result: Result; mediaUrl?: string }) {
  const mediaRef = useRef<HTMLMediaElement>(null);
  const [view, setView] = useState<TranscriptView>('full');
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [downloadState, setDownloadState] = useState<'idle' | 'preparing' | 'done'>('idle');
  const [youtubeStart, setYoutubeStart] = useState(0);
  const base = safeBaseName(result.sourceName);
  const ytId = youtubeId(result.youtubeUrl);
  const fullParagraphs = useMemo(() => fullTranscriptParagraphs(result.segments), [result.segments]);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleParagraphs = useMemo(() => normalizedQuery
    ? fullParagraphs.filter((paragraph) => paragraph.toLowerCase().includes(normalizedQuery))
    : fullParagraphs, [fullParagraphs, normalizedQuery]);
  const visibleSegments = useMemo(() => normalizedQuery
    ? result.segments.filter((segment) => segment.text.toLowerCase().includes(normalizedQuery))
    : result.segments, [normalizedQuery, result.segments]);
  const matches = normalizedQuery ? (view === 'full' ? visibleParagraphs.length : visibleSegments.length) : 0;

  const seek = (seconds: number) => {
    if (mediaRef.current) { mediaRef.current.currentTime = seconds; void mediaRef.current.play(); }
    else if (ytId) setYoutubeStart(Math.floor(seconds));
  };

  const copyCurrentView = async () => {
    const content = view === 'full' ? fullTranscriptText(result) : timestampedTranscriptText(result);
    await navigator.clipboard.writeText(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const downloadCurrentView = async () => {
    setDownloadState('preparing');
    try {
      const blob = await buildTranscriptDocx({ result, view, fullParagraphs, formatTime: formatTimestamp });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${base}-transcript.docx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownloadState('done');
      window.setTimeout(() => setDownloadState('idle'), 1600);
    } catch (error) {
      console.error('Unable to create transcript document', error);
      setDownloadState('idle');
    }
  };

  const selectView = (nextView: TranscriptView) => {
    setView(nextView);
    setCopied(false);
    setDownloadState('idle');
  };

  return (
    <section className="result-shell">
      <header className="mission-complete"><span className="success-mark">✓</span><div><p>MISSION COMPLETE</p><h2>Transcript successfully generated.</h2></div><div className="language-badge"><small>DETECTED LANGUAGE</small><strong>{result.language}</strong></div></header>
      <div className="result-grid">
        <aside className="media-column">
          <div className="media-frame">
            {result.sourceKind === 'video' && mediaUrl && <video ref={mediaRef as React.RefObject<HTMLVideoElement>} controls src={mediaUrl} preload="metadata" />}
            {result.sourceKind === 'audio' && mediaUrl && <div className="audio-player"><div className="sound-orbit"><span>忍</span></div><audio ref={mediaRef as React.RefObject<HTMLAudioElement>} controls src={mediaUrl} preload="metadata" /></div>}
            {ytId && <iframe key={youtubeStart} src={`https://www.youtube-nocookie.com/embed/${ytId}?start=${youtubeStart}&autoplay=${youtubeStart ? 1 : 0}`} title={result.sourceName} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />}
          </div>
          <div className="source-info"><p>SOURCE SCROLL</p><strong title={result.sourceName}>{result.sourceName}</strong><span>{formatTimestamp(result.duration, result.duration >= 3600)} · {result.segments.length} passages</span></div>
          <div className="diarization-note"><span>{result.speakersDetected ? '◉' : '○'}</span><p><strong>{result.speakersDetected ? 'SPEAKERS DETECTED' : 'SINGLE VOICE MODE'}</strong>{result.speakersDetected ? 'Real speaker labels are included.' : 'No speaker labels were returned.'}</p></div>
        </aside>
        <div className="transcript-column">
          <div className="transcript-tabs" role="tablist" aria-label="Transcript view">
            <button type="button" role="tab" aria-selected={view === 'full'} onClick={() => selectView('full')}>FULL TRANSCRIPT</button>
            <button type="button" role="tab" aria-selected={view === 'timestamped'} onClick={() => selectView('timestamped')}>TIMESTAMPED</button>
          </div>
          <div className="transcript-toolbar">
            <div className="tool-actions">
              <button type="button" onClick={copyCurrentView}>{copied ? 'Copied!' : 'Copy'}</button>
              <button type="button" onClick={downloadCurrentView} disabled={downloadState === 'preparing'}>
                {downloadState === 'preparing' ? 'Preparing…' : downloadState === 'done' ? 'Downloaded!' : 'Download'}
              </button>
            </div>
            <label className="search-box"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search transcript" aria-label="Search transcript" />{query && <small>{matches}</small>}</label>
          </div>
          <div className="transcript-scroll" tabIndex={0} role="tabpanel">
            {view === 'full' ? (
              <div className="full-transcript" aria-label="Full transcript">
                {visibleParagraphs.map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 24)}`}><Highlight text={paragraph} query={query} /></p>)}
              </div>
            ) : visibleSegments.map((segment) => (
              <article className="transcript-segment" key={segment.id}>
                <button type="button" onClick={() => seek(segment.start)} title="Jump to this moment">{formatTimestamp(segment.start, result.duration >= 3600)}</button>
                <div>{segment.speaker && <strong>Speaker {segment.speaker}</strong>}<p><Highlight text={segment.text} query={query} /></p></div>
              </article>
            ))}
            {normalizedQuery && matches === 0 && <p className="no-transcript-matches">No matching transcript text.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
