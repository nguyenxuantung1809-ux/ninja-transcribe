'use client';

import { useMemo, useRef, useState } from 'react';
import type { TranscriptResult as Result } from '@/types/transcript';
import { formatTimestamp } from '@/utils/format';
import { downloadText, safeBaseName, toSrt, toTxt, toVtt } from '@/utils/transcript-export';

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'ig'));
  return <>{parts.map((part, index) => part.toLowerCase() === query.toLowerCase() ? <mark key={index}>{part}</mark> : part)}</>;
}

function youtubeId(url?: string): string | null {
  if (!url) return null;
  try { return new URL(url).searchParams.get('v'); } catch { return null; }
}

export function TranscriptResult({ result, mediaUrl, onClear }: { result: Result; mediaUrl?: string; onClear: () => void }) {
  const mediaRef = useRef<HTMLMediaElement>(null);
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [youtubeStart, setYoutubeStart] = useState(0);
  const base = safeBaseName(result.sourceName);
  const ytId = youtubeId(result.youtubeUrl);
  const matches = useMemo(() => query.trim() ? result.segments.filter((segment) => segment.text.toLowerCase().includes(query.toLowerCase())).length : 0, [query, result.segments]);

  const seek = (seconds: number) => {
    if (mediaRef.current) { mediaRef.current.currentTime = seconds; void mediaRef.current.play(); }
    else if (ytId) setYoutubeStart(Math.floor(seconds));
  };

  const copyAll = async () => {
    await navigator.clipboard.writeText(toTxt(result));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
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
          <div className="transcript-toolbar">
            <div className="tool-actions">
              <button type="button" onClick={copyAll}>{copied ? 'COPIED ✓' : 'COPY ALL'}</button>
              <button type="button" onClick={() => downloadText(`${base}.txt`, toTxt(result), 'text/plain')}>TXT</button>
              <button type="button" onClick={() => downloadText(`${base}.srt`, toSrt(result), 'application/x-subrip')}>SRT</button>
              <button type="button" onClick={() => downloadText(`${base}.vtt`, toVtt(result), 'text/vtt')}>VTT</button>
              <button className="clear-button" type="button" onClick={onClear}>CLEAR</button>
            </div>
            <label className="search-box"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search transcript" aria-label="Search transcript" />{query && <small>{matches}</small>}</label>
          </div>
          <div className="transcript-scroll" tabIndex={0}>
            {result.segments.map((segment) => (
              <article className="transcript-segment" key={segment.id}>
                <button type="button" onClick={() => seek(segment.start)} title="Jump to this moment">{formatTimestamp(segment.start, result.duration >= 3600)}</button>
                <div>{segment.speaker && <strong>Speaker {segment.speaker}</strong>}<p><Highlight text={segment.text} query={query} /></p></div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
