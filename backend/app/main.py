from __future__ import annotations

import os
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .jobs import JobManager
from .pipeline import PipelineError, _ffmpeg_binary, cleanup_expired_paths


manager = JobManager()


@asynccontextmanager
async def lifespan(_: FastAPI):
    cleanup_expired_paths(Path(tempfile.gettempdir()))
    yield
    manager.shutdown()


app = FastAPI(title="Ninja Transcribe Backend", version="1.0.0", lifespan=lifespan)
origins = [item.strip() for item in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if item.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=False, allow_methods=["GET", "POST"], allow_headers=["Authorization", "Content-Type"])


class YouTubeJobRequest(BaseModel):
    url: str = Field(min_length=10, max_length=2048)


def require_secret(authorization: str | None = Header(default=None)) -> None:
    expected = os.getenv("BACKEND_SHARED_SECRET", "").strip()
    if not expected:
        raise HTTPException(status_code=503, detail={"code": "BACKEND_SECRET_MISSING", "message": "The transcription service is temporarily unavailable."})
    if authorization != f"Bearer {expected}":
        raise HTTPException(status_code=401, detail={"code": "UNAUTHORIZED", "message": "Invalid backend credential."})


@app.get("/health")
def health() -> dict[str, object]:
    try:
        ffmpeg_available = bool(_ffmpeg_binary())
    except PipelineError:
        ffmpeg_available = False
    return {
        "ok": True,
        "openaiConfigured": bool(os.getenv("OPENAI_API_KEY", "").strip()),
        "sharedSecretConfigured": bool(os.getenv("BACKEND_SHARED_SECRET", "").strip()),
        "ytDlpAvailable": True,
        "ffmpegConfigured": ffmpeg_available,
    }


@app.post("/v1/youtube/jobs", status_code=202, dependencies=[Depends(require_secret)])
def create_youtube_job(body: YouTubeJobRequest) -> dict[str, object]:
    try:
        return manager.create(body.url).to_dict()
    except PipelineError as exc:
        raise HTTPException(status_code=exc.http_status, detail={"code": exc.code, "message": exc.public_message}) from exc


@app.get("/v1/youtube/jobs/{job_id}", dependencies=[Depends(require_secret)])
def get_youtube_job(job_id: str) -> dict[str, object]:
    job = manager.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail={"code": "JOB_NOT_FOUND", "message": "This transcription job was not found or has expired."})
    return job.to_dict()
