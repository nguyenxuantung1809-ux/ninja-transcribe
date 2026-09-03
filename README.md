# Ninja Transcribe

A privacy-minded speech-to-text web app for uploaded media and public YouTube URLs.

## Local setup

1. Copy `.env.example` to `.env.local` and set the frontend/backend URL and shared secret.
2. Create `backend/.venv`, install `backend/requirements.txt`, and set `OPENAI_API_KEY` plus `BACKEND_SHARED_SECRET` in the backend process.
3. Start the backend on port `8788` as documented in `backend/README.md`.
4. Run `pnpm install`, then `pnpm dev`, and open the local URL shown in the terminal.

Uploads are sent directly to the server-side transcription route and are not written to permanent storage. YouTube mode tries captions first, then automatically downloads an audio-only stream with `yt-dlp`, creates speech-sized MP3 chunks with `ffmpeg`, and sends them to OpenAI speech-to-text. Every downloaded/converted file lives in a temporary directory that is removed whether the job succeeds or fails.

## Structure

- `components/` — UI surfaces and result tools
- `services/` — browser-side media, transcription and YouTube clients
- `server/transcription/` — OpenAI transcription adapter
- `server/youtube/` — Sites-side caption fast path and private backend proxy
- `backend/` — long-running YouTube job service (`yt-dlp` → `ffmpeg` → OpenAI)
- `utils/` — timestamp formatting and transcript exports
