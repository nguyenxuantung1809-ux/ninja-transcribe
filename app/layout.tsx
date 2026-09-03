import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://ninja-transcribe.hasagi0908.chatgpt.site'),
  title: 'Ninja Transcribe — Video to Text',
  description: 'Turn video, audio and YouTube content into clean, timestamped transcripts.',
  openGraph: {
    title: 'Ninja Transcribe — Video to Text',
    description: 'Turn video, audio and YouTube content into clean, timestamped transcripts.',
    images: [{ url: '/og.png', width: 1536, height: 1024, alt: 'Ninja Transcribe — Video to Text' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Ninja Transcribe — Video to Text',
    description: 'Turn video, audio and YouTube content into clean, timestamped transcripts.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
