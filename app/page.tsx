'use client';

import { useEffect, useRef, useState } from 'react';
import { FileDropzone } from '@/components/FileDropzone';
import { ProcessingScreen } from '@/components/ProcessingScreen';
import { SourceCards } from '@/components/SourceCards';
import { TranscriptResult } from '@/components/TranscriptResult';
import { readMediaDetails, validateMediaFile } from '@/services/media-processing/media';
import { transcribeFile } from '@/services/transcription/client';
import { isYouTubeUrl, transcribeYouTube, type YouTubeStage } from '@/services/youtube/client';
import type { MediaDetails, SourceKind, TranscriptResult as Result } from '@/types/transcript';
import { formatBytes, formatTimestamp } from '@/utils/format';

type Phase = 'choose' | 'ready' | 'processing' | 'result';

export default function Home() {
  const [phase, setPhase] = useState<Phase>('choose');
  const [source, setSource] = useState<SourceKind | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [details, setDetails] = useState<MediaDetails | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [mediaUrl, setMediaUrl] = useState<string>();
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [configuration, setConfiguration] = useState<{ upload: boolean; youtube: boolean } | null>(null);
  const [youtubeStage, setYoutubeStage] = useState<YouTubeStage>('reading_video');
  const missionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    fetch('/api/health').then(async (response) => {
      const data = await response.json() as { uploadTranscriptionConfigured?: boolean; youtubeTranscriptionConfigured?: boolean };
      setConfiguration({ upload: Boolean(data.uploadTranscriptionConfigured), youtube: Boolean(data.youtubeTranscriptionConfigured) });
    }).catch(() => setConfiguration(null));
  }, []);

  useEffect(() => () => { if (mediaUrl) URL.revokeObjectURL(mediaUrl); }, [mediaUrl]);

  const selectSource = (next: SourceKind) => {
    if (mediaUrl) URL.revokeObjectURL(mediaUrl);
    setSource(next); setFile(null); setDetails(null); setYoutubeUrl(''); setMediaUrl(undefined); setResult(null); setError(null); setPhase('ready');
    window.setTimeout(() => missionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  };

  const selectFile = async (nextFile: File) => {
    if (source !== 'video' && source !== 'audio') return;
    const issue = validateMediaFile(nextFile, source);
    if (issue) { setError(issue); return; }
    if (mediaUrl) URL.revokeObjectURL(mediaUrl);
    setError(null); setFile(nextFile); setDetails(null); setMediaUrl(URL.createObjectURL(nextFile));
    setDetails(await readMediaDetails(nextFile, source));
  };

  const startTranscription = async () => {
    if (!source) return;
    if (source === 'youtube' && !isYouTubeUrl(youtubeUrl)) { setError('Paste a valid YouTube URL, such as https://youtube.com/watch?v=...'); return; }
    if (source !== 'youtube' && !file) { setError(`Choose a ${source} file first.`); return; }
    setError(null); setProgress(7); setYoutubeStage('reading_video'); setPhase('processing');
    const timer = source === 'youtube' ? undefined : window.setInterval(() => setProgress((value) => Math.min(88, value + (value < 40 ? 7 : value < 70 ? 4 : 1.5))), 700);
    try {
      const transcript = source === 'youtube'
        ? await transcribeYouTube(youtubeUrl, (value, stage) => { setProgress(value); setYoutubeStage(stage); })
        : await transcribeFile(file!, source);
      if (timer) window.clearInterval(timer); setProgress(100); setYoutubeStage('completed'); setResult(transcript);
      window.setTimeout(() => { setPhase('result'); window.scrollTo({ top: 0, behavior: 'smooth' }); }, 480);
    } catch (caught) {
      if (timer) window.clearInterval(timer); setError(caught instanceof Error ? caught.message : 'The mission failed unexpectedly. Please try again.');
      setPhase('ready'); setProgress(0);
      window.setTimeout(() => missionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
    }
  };

  const clear = () => {
    if (mediaUrl) URL.revokeObjectURL(mediaUrl);
    setPhase('choose'); setSource(null); setFile(null); setDetails(null); setYoutubeUrl(''); setMediaUrl(undefined); setResult(null); setError(null); setProgress(0); setYoutubeStage('reading_video');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const isReady = source === 'youtube' ? isYouTubeUrl(youtubeUrl) : Boolean(file && details);

  return (
    <main className={`app-shell ${phase === 'result' ? 'result-mode' : ''}`}>
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <nav className="topbar" aria-label="Primary navigation">
        <button className="brand" type="button" onClick={clear} aria-label="Ninja Transcribe home"><span className="brand-mark">忍</span><span><strong>NINJA</strong> TRANSCRIBE</span></button>
        <div className={`status-pill ${configuration && !configuration.upload && !configuration.youtube ? 'needs-key' : ''}`}><span /> {configuration && !configuration.upload && !configuration.youtube ? 'SETUP NEEDED' : 'SYSTEM READY'}</div>
      </nav>

      {phase !== 'result' && phase !== 'processing' && <>
        <section className="hero" id="top">
          <div className="rank-seal" aria-hidden="true"><span>忍</span><small>AI</small></div>
          <p className="kicker"><span /> SHINOBI VOICE INTELLIGENCE <span /></p>
          <h1>VIDEO <em>→</em> TEXT</h1>
          <p className="subtitle">Turn any video or audio into clean, searchable text.</p>
          <p className="hero-note">Choose your mission source. We handle the rest.</p>
        </section>
        <SourceCards active={source} onSelect={selectSource} />
      </>}

      {phase === 'ready' && source && <section className="mission-panel" ref={missionRef}>
        <header className="mission-header"><div><p>MISSION {source === 'video' ? '01' : source === 'audio' ? '02' : '03'} {'// INPUT'}</p><h2>{source === 'youtube' ? 'REMOTE SCROLL' : `LOAD ${source.toUpperCase()} SCROLL`}</h2></div><button type="button" onClick={() => { setSource(null); setPhase('choose'); setError(null); }}>CHANGE SOURCE</button></header>
        {source !== 'youtube' && !file && <FileDropzone kind={source} onFile={selectFile} />}
        {source !== 'youtube' && file && details && <div className="file-ready">
          <div className="file-glyph"><span>{source === 'video' ? '▶' : '◉'}</span><i /></div>
          <div className="file-title"><small>SCROLL VERIFIED</small><strong title={details.name}>{details.name}</strong><button type="button" onClick={() => { setFile(null); setDetails(null); setError(null); }}>Choose another</button></div>
          <dl><div><dt>DURATION</dt><dd>{details.duration == null ? 'Unknown' : formatTimestamp(details.duration, details.duration >= 3600)}</dd></div><div><dt>FILE SIZE</dt><dd>{formatBytes(details.size)}</dd></div><div><dt>TYPE</dt><dd>{details.type || 'Media'}</dd></div></dl>
        </div>}
        {source !== 'youtube' && file && !details && <div className="metadata-loading"><span /> Reading media scroll...</div>}
        {source === 'youtube' && <div className="youtube-entry"><label htmlFor="youtube-url">YOUTUBE MISSION URL</label><div><span>↗</span><input id="youtube-url" value={youtubeUrl} onChange={(event) => { setYoutubeUrl(event.target.value); setError(null); }} placeholder="https://youtube.com/watch?v=..." inputMode="url" autoComplete="url" /></div><p>Paste a public YouTube link. We use captions when available, otherwise the server extracts audio and transcribes it automatically.</p></div>}
        {configuration?.upload === false && source !== 'youtube' && <div className="setup-notice"><span>!</span><p><strong>ONE-TIME SETUP NEEDED</strong>Add <code>OPENAI_API_KEY</code> to the app environment before live transcription.</p></div>}
        {configuration?.youtube === false && source === 'youtube' && <div className="setup-notice"><span>!</span><p><strong>YOUTUBE BACKEND SETUP NEEDED</strong>Configure the private transcription backend and its server-side <code>OPENAI_API_KEY</code>. Caption fast path may still work.</p></div>}
        {error && <div className="error-banner" role="alert"><span>!</span><p><strong>MISSION INTERRUPTED</strong>{error}</p></div>}
        <button className="jutsu-button" type="button" disabled={!isReady} onClick={startTranscription}><span>START TRANSCRIPTION</span><small>「 TRANSCRIPTION JUTSU 」</small><b>→</b></button>
      </section>}

      {phase === 'processing' && source && <ProcessingScreen progress={progress} source={source} youtubeStage={youtubeStage} />}
      {phase === 'result' && result && <TranscriptResult result={result} mediaUrl={mediaUrl} onClear={clear} />}
      {phase !== 'result' && <footer className="privacy-line"><span className="lock-mark">◆</span><p><strong>PRIVATE BY DESIGN</strong> Your files are processed temporarily and never permanently stored.</p><span className="footer-code">NT // 001</span></footer>}
    </main>
  );
}
