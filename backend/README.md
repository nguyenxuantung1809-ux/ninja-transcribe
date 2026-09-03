# Ninja Transcribe backend

This service runs the parts that cannot execute inside ChatGPT Sites/Cloudflare Workers: `yt-dlp`, `ffmpeg`, long-running jobs, and OpenAI speech-to-text requests.

## Required environment

- `OPENAI_API_KEY`: server-only OpenAI API key.
- `BACKEND_SHARED_SECRET`: a long random value shared only with the Sites server routes.
- `ALLOWED_ORIGINS`: comma-separated frontend origins.

Optional: `YOUTUBE_COOKIES_B64`, `YOUTUBE_COOKIES_FILE`, `YOUTUBE_PROXY`, `OPENAI_TRANSCRIBE_MODEL`, `AUDIO_CHUNK_SECONDS`, `MAX_CONCURRENT_JOBS`, `JOB_TTL_SECONDS`.

## Local run

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
$env:OPENAI_API_KEY = "..."
$env:BACKEND_SHARED_SECRET = "local-development-secret"
.\.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8788
```

The frontend uses `TRANSCRIPTION_BACKEND_URL=http://127.0.0.1:8788` and the same `BACKEND_SHARED_SECRET` value. Deploy the `backend` Dockerfile to Railway (or any Docker host), then place its HTTPS URL and secret in the Sites environment. Never expose `OPENAI_API_KEY` in any `NEXT_PUBLIC_*` variable.

From the repository root, the shortest Railway deployment is:

```powershell
railway up ./backend --path-as-root --new --name ninja-transcribe-backend
```

Add the required secrets in the Railway service Variables tab, configure a public domain, and keep this job service at one replica because job state is process-local. The included health check uses `/health` and the container listens on Railway's injected `PORT`.
