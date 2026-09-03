import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';
import type { TranscriptResult } from '@/types/transcript';
import type { TranscriptView } from '@/utils/transcript-view';

export interface TranscriptDocxContent {
  result: TranscriptResult;
  view: TranscriptView;
  fullParagraphs: string[];
  formatTime: (seconds: number, showHours: boolean) => string;
}

const FONT = 'Calibri';
const INK = '252A30';
const ACCENT = 'D85B08';
const HEADING = '2E74B5';

function bodyParagraph(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 160, line: 320 },
    children: [new TextRun({ text, font: FONT, size: 22, color: INK })],
  });
}

function timestampedParagraphs(result: TranscriptResult, formatTime: TranscriptDocxContent['formatTime']): Paragraph[] {
  const showHours = result.duration >= 3600;
  return result.segments.flatMap((segment) => {
    const label = segment.speaker
      ? `${formatTime(segment.start, showHours)}  ·  Speaker ${segment.speaker}`
      : formatTime(segment.start, showHours);

    return [
      new Paragraph({
        keepNext: true,
        spacing: { before: 160, after: 40 },
        children: [new TextRun({ text: label, bold: true, font: FONT, size: 18, color: ACCENT })],
      }),
      new Paragraph({
        spacing: { after: 120, line: 300 },
        children: [new TextRun({ text: segment.text.replace(/\s+/g, ' ').trim(), font: FONT, size: 22, color: INK })],
      }),
    ];
  });
}

export async function buildTranscriptDocx({ result, view, fullParagraphs, formatTime }: TranscriptDocxContent): Promise<Blob> {
  const modeHeading = view === 'full' ? 'Full Transcript' : 'Timestamped Transcript';
  const content = view === 'full'
    ? fullParagraphs.map(bodyParagraph)
    : timestampedParagraphs(result, formatTime);

  const document = new Document({
    creator: 'Ninja Transcribe',
    title: `${result.sourceName} - ${modeHeading}`,
    description: `Transcript exported by Ninja Transcribe in ${modeHeading} mode.`,
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 22, color: INK },
          paragraph: { spacing: { after: 160, line: 320 } },
        },
        heading1: {
          run: { font: FONT, size: 32, bold: true, color: HEADING },
          paragraph: { spacing: { before: 360, after: 200 } },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      children: [
        new Paragraph({
          spacing: { after: 120 },
          children: [new TextRun({ text: result.sourceName, font: FONT, size: 44, bold: true, color: INK })],
        }),
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun(modeHeading)],
        }),
        ...content,
      ],
    }],
  });

  return Packer.toBlob(document);
}

