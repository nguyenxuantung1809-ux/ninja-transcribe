'use client';

import { useRef, useState } from 'react';
import type { SourceKind } from '@/types/transcript';
import { AUDIO_EXTENSIONS, VIDEO_EXTENSIONS } from '@/services/media-processing/media';

export function FileDropzone({ kind, onFile }: { kind: Exclude<SourceKind, 'youtube'>; onFile: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const extensions = kind === 'video' ? VIDEO_EXTENSIONS : AUDIO_EXTENSIONS;

  const receive = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onFile(file);
  };

  return (
    <div className={`dropzone ${dragging ? 'dragging' : ''}`} role="button" tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click(); }}
      onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={(event) => { event.preventDefault(); if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
      onDrop={(event) => { event.preventDefault(); setDragging(false); receive(event.dataTransfer.files); }}>
      <input ref={inputRef} type="file" hidden accept={extensions.map((ext) => `.${ext}`).join(',')} onChange={(event) => receive(event.target.files)} />
      <span className="drop-icon"><i /><i /><b>{kind === 'video' ? '▶' : '◉'}</b></span>
      <strong>DROP {kind.toUpperCase()} SCROLL HERE</strong>
      <span>or click to browse from your device</span>
      <small>{extensions.map((ext) => ext.toUpperCase()).join(' · ')} &nbsp; // &nbsp; MAX 100 MB</small>
      <div className="scan-line" />
    </div>
  );
}
