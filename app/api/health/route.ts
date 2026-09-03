export const runtime = 'edge';

export function GET() {
  return Response.json({ ok: true, transcriptionConfigured: Boolean(process.env.OPENAI_API_KEY) });
}
