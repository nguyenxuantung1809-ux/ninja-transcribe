import type { SourceKind } from '@/types/transcript';
import type { YouTubeStage } from '@/services/youtube/client';

const steps = [
  { min: 0, label: 'Preparing source' },
  { min: 18, label: 'Extracting voice signal' },
  { min: 42, label: 'Detecting speech' },
  { min: 68, label: 'Recognizing words' },
  { min: 91, label: 'Generating transcript' },
];

const youtubeSteps: Array<{ stage: YouTubeStage; label: string }> = [
  { stage: 'reading_video', label: 'Reading YouTube video' },
  { stage: 'downloading_audio', label: 'Extracting audio' },
  { stage: 'transcribing', label: 'Transcribing audio' },
  { stage: 'completed', label: 'Preparing transcript' },
];

const stageOrder: Record<YouTubeStage, number> = { reading_video: 0, downloading_audio: 1, converting_audio: 1, transcribing: 2, completed: 3 };

export function ProcessingScreen({ progress, source, youtubeStage = 'reading_video' }: { progress: number; source: SourceKind; youtubeStage?: YouTubeStage }) {
  const activeIndex = source === 'youtube' ? stageOrder[youtubeStage] : steps.reduce((found, step, index) => progress >= step.min ? index : found, 0);
  const displayedSteps = source === 'youtube' ? youtubeSteps : steps;
  return (
    <section className="processing-panel" aria-live="polite" aria-label="Transcription progress">
      <div className="chakra-core"><span>忍</span><i /><b /></div>
      <p className="section-kicker">CHAKRA ANALYSIS // {source.toUpperCase()}</p>
      <h2>TRANSCRIPTION JUTSU</h2>
      <p className="processing-copy">Listening carefully. Long missions can take several minutes.</p>
      <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
      <div className="progress-meta"><strong>{Math.round(progress)}%</strong><span>{displayedSteps[activeIndex].label}{activeIndex < displayedSteps.length - 1 ? '...' : ''}</span></div>
      <ol className="process-steps">
        {displayedSteps.map((step, index) => <li key={step.label} className={index < activeIndex ? 'done' : index === activeIndex ? 'current' : ''}><span>{index < activeIndex ? '✓' : String(index + 1).padStart(2, '0')}</span>{step.label}</li>)}
      </ol>
    </section>
  );
}
