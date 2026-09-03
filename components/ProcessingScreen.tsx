import type { SourceKind } from '@/types/transcript';

const steps = [
  { min: 0, label: 'Preparing source' },
  { min: 18, label: 'Extracting voice signal' },
  { min: 42, label: 'Detecting speech' },
  { min: 68, label: 'Recognizing words' },
  { min: 91, label: 'Generating transcript' },
];

export function ProcessingScreen({ progress, source }: { progress: number; source: SourceKind }) {
  const activeIndex = steps.reduce((found, step, index) => progress >= step.min ? index : found, 0);
  return (
    <section className="processing-panel" aria-live="polite" aria-label="Transcription progress">
      <div className="chakra-core"><span>忍</span><i /><b /></div>
      <p className="section-kicker">CHAKRA ANALYSIS // {source.toUpperCase()}</p>
      <h2>TRANSCRIPTION JUTSU</h2>
      <p className="processing-copy">Listening carefully. Long missions can take several minutes.</p>
      <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
      <div className="progress-meta"><strong>{Math.round(progress)}%</strong><span>{steps[activeIndex].label}...</span></div>
      <ol className="process-steps">
        {steps.map((step, index) => <li key={step.label} className={index < activeIndex ? 'done' : index === activeIndex ? 'current' : ''}><span>{index < activeIndex ? '✓' : String(index + 1).padStart(2, '0')}</span>{step.label}</li>)}
      </ol>
    </section>
  );
}
