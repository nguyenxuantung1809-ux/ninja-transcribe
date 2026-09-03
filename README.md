# Ninja Transcribe

A privacy-minded speech-to-text web app for video, audio and accessible YouTube captions.

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Set `OPENAI_API_KEY` in `.env.local`.
3. Run `pnpm install`, then `pnpm dev`.
4. Open the local URL shown in the terminal.

Uploads are sent directly to the server-side transcription route and are not written to permanent storage. YouTube mode retrieves accessible caption tracks and returns a clear upload fallback when captions are unavailable.

## Structure

- `components/` — UI surfaces and result tools
- `services/` — browser-side media, transcription and YouTube clients
- `server/transcription/` — OpenAI transcription adapter
- `server/youtube/` — safe YouTube caption retrieval
- `utils/` — timestamp formatting and transcript exports
