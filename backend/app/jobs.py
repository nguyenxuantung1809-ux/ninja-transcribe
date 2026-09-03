from __future__ import annotations

import os
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any

from .pipeline import PipelineError, canonical_url, run_pipeline


@dataclass
class Job:
    id: str
    url: str
    status: str = "queued"
    stage: str = "reading_video"
    progress: float = 2
    message: str = "Đang đọc video"
    result: dict[str, Any] | None = None
    error_code: str | None = None
    error: str | None = None
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "jobId": self.id,
            "status": self.status,
            "stage": self.stage,
            "progress": round(self.progress, 1),
            "message": self.message,
        }
        if self.result is not None:
            payload["result"] = self.result
        if self.error is not None:
            payload["error"] = {"code": self.error_code, "message": self.error}
        return payload


class JobManager:
    def __init__(self) -> None:
        workers = max(1, min(int(os.getenv("MAX_CONCURRENT_JOBS", "2")), 8))
        self._executor = ThreadPoolExecutor(max_workers=workers, thread_name_prefix="youtube-job")
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()

    def create(self, input_url: str) -> Job:
        url = canonical_url(input_url)
        job = Job(id=str(uuid.uuid4()), url=url)
        with self._lock:
            self._prune_locked()
            self._jobs[job.id] = job
        self._executor.submit(self._run, job.id)
        return job

    def get(self, job_id: str) -> Job | None:
        with self._lock:
            self._prune_locked()
            return self._jobs.get(job_id)

    def shutdown(self) -> None:
        self._executor.shutdown(wait=False, cancel_futures=False)

    def _update(self, job_id: str, **changes: Any) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return
            for key, value in changes.items():
                setattr(job, key, value)
            job.updated_at = time.time()

    def _progress(self, job_id: str, stage: str, progress: float, message: str) -> None:
        self._update(job_id, status="processing", stage=stage, progress=max(0, min(progress, 100)), message=message)

    def _run(self, job_id: str) -> None:
        job = self.get(job_id)
        if not job:
            return
        self._update(job_id, status="processing")
        try:
            result = run_pipeline(job.url, lambda stage, value, message: self._progress(job_id, stage, value, message))
            self._update(job_id, status="completed", stage="completed", progress=100, message="Hoàn thành", result=result)
        except PipelineError as exc:
            self._update(job_id, status="failed", error_code=exc.code, error=exc.public_message)
        except Exception:
            self._update(job_id, status="failed", error_code="INTERNAL_ERROR", error="The transcription server encountered an unexpected error.")

    def _prune_locked(self) -> None:
        expiry = time.time() - int(os.getenv("JOB_TTL_SECONDS", "3600"))
        expired = [job_id for job_id, job in self._jobs.items() if job.updated_at < expiry and job.status in {"completed", "failed"}]
        for job_id in expired:
            del self._jobs[job_id]
