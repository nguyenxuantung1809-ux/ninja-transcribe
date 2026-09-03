from __future__ import annotations

import base64
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable
from urllib.parse import parse_qs, urlparse

import httpx
import yt_dlp
from yt_dlp.utils import DownloadError


ProgressCallback = Callable[[str, float, str], None]
VIDEO_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{11}$")


@dataclass
class PipelineError(Exception):
    code: str
    public_message: str
    http_status: int = 422

    def __str__(self) -> str:
        return self.public_message


def extract_video_id(value: str) -> str:
    try:
        parsed = urlparse(value.strip())
    except ValueError as exc:
        raise PipelineError("INVALID_URL", "This is not a valid YouTube URL.", 400) from exc

    host = (parsed.hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]

    video_id: str | None = None
    if host == "youtu.be":
        video_id = parsed.path.strip("/").split("/")[0]
    elif host == "youtube.com" or host.endswith(".youtube.com"):
        if parsed.path == "/watch":
            video_id = parse_qs(parsed.query).get("v", [None])[0]
        else:
            match = re.match(r"^/(?:shorts|embed|live)/([^/?#]+)", parsed.path)
            video_id = match.group(1) if match else None

    if not video_id or not VIDEO_ID_PATTERN.fullmatch(video_id):
        raise PipelineError("INVALID_URL", "This is not a valid YouTube video URL.", 400)
    return video_id


def canonical_url(value: str) -> str:
    return f"https://www.youtube.com/watch?v={extract_video_id(value)}"


def _map_youtube_error(error: BaseException, *, audio_download: bool = False) -> PipelineError:
    detail = str(error).lower()
    if "private video" in detail or "this video is private" in detail:
        return PipelineError("PRIVATE_VIDEO", "This YouTube video is private.")
    if any(token in detail for token in ("sign in to confirm your age", "age-restricted", "login required", "members-only")):
        return PipelineError("LOGIN_REQUIRED", "This video is age/login restricted and cannot be accessed by the transcription server.")
    if any(token in detail for token in ("video unavailable", "video is unavailable", "has been removed", "not available", "copyright")):
        return PipelineError("VIDEO_UNAVAILABLE", "This YouTube video is unavailable.")
    if any(token in detail for token in ("http error 403", "http error 429", "forbidden", "too many requests", "not a bot")):
        return PipelineError("YOUTUBE_BLOCKED", "YouTube refused access from the transcription server. Try again shortly or configure server-side YouTube cookies/proxy access.", 502)
    if audio_download:
        return PipelineError("AUDIO_DOWNLOAD_FAILED", "The server could not download this video's audio stream.", 502)
    return PipelineError("YOUTUBE_BLOCKED", "YouTube could not be read by the transcription server.", 502)


def _ffmpeg_binary() -> str:
    configured = os.getenv("FFMPEG_BINARY", "").strip()
    if configured:
        return configured
    installed = shutil.which("ffmpeg")
    if installed:
        return installed
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception as exc:  # pragma: no cover - depends on deployment image
        raise PipelineError("FFMPEG_UNAVAILABLE", "ffmpeg is not installed on the transcription server.", 500) from exc


def _cookie_file(temp_dir: Path) -> Path | None:
    cookie_path = os.getenv("YOUTUBE_COOKIES_FILE", "").strip()
    if cookie_path:
        resolved = Path(cookie_path)
        if resolved.is_file():
            return resolved

    encoded = os.getenv("YOUTUBE_COOKIES_B64", "").strip()
    if not encoded:
        return None
    try:
        target = temp_dir / "youtube-cookies.txt"
        target.write_bytes(base64.b64decode(encoded, validate=True))
        return target
    except (ValueError, OSError) as exc:
        raise PipelineError("YOUTUBE_COOKIE_CONFIG_INVALID", "The server-side YouTube cookie secret is invalid.", 500) from exc


def _ydl_options(temp_dir: Path, download: bool, progress: ProgressCallback) -> dict[str, Any]:
    options: dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "socket_timeout": 30,
        "retries": 3,
        "fragment_retries": 3,
        "extractor_retries": 3,
        "outtmpl": str(temp_dir / "source.%(ext)s"),
        "format": "bestaudio" if download else None,
    }
    proxy = os.getenv("YOUTUBE_PROXY", "").strip()
    if proxy:
        options["proxy"] = proxy
    cookie_file = _cookie_file(temp_dir)
    if cookie_file:
        options["cookiefile"] = str(cookie_file)
    if download:
        options["ffmpeg_location"] = _ffmpeg_binary()

        def hook(payload: dict[str, Any]) -> None:
            if payload.get("status") != "downloading":
                return
            total = payload.get("total_bytes") or payload.get("total_bytes_estimate") or 0
            downloaded = payload.get("downloaded_bytes") or 0
            ratio = min(float(downloaded) / float(total), 1.0) if total else 0.0
            progress("downloading_audio", 25 + ratio * 22, "Đang lấy audio")

        options["progress_hooks"] = [hook]
    else:
        options["skip_download"] = True
    return options


def _extract_info(url: str, temp_dir: Path, progress: ProgressCallback) -> dict[str, Any]:
    try:
        with yt_dlp.YoutubeDL(_ydl_options(temp_dir, False, progress)) as ydl:
            info = ydl.extract_info(url, download=False)
    except DownloadError as exc:
        raise _map_youtube_error(exc) from exc
    except Exception as exc:
        raise _map_youtube_error(exc) from exc
    if not isinstance(info, dict):
        raise PipelineError("VIDEO_UNAVAILABLE", "This YouTube video is unavailable.")
    availability = str(info.get("availability") or "").lower()
    if availability == "private":
        raise PipelineError("PRIVATE_VIDEO", "This YouTube video is private.")
    if availability in {"needs_auth", "premium_only", "subscriber_only"}:
        raise PipelineError("LOGIN_REQUIRED", "This video requires a login or membership.")
    return info


def _caption_candidates(info: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    tracks: list[tuple[str, dict[str, Any]]] = []
    for group_name in ("subtitles", "automatic_captions"):
        group = info.get(group_name)
        if not isinstance(group, dict):
            continue
        preferred = sorted(group, key=lambda code: (code not in {"vi", "en", "en-US", "en-GB"}, code))
        for language in preferred:
            formats = group.get(language)
            if not isinstance(formats, list):
                continue
            json_track = next((item for item in formats if isinstance(item, dict) and item.get("ext") == "json3" and item.get("url")), None)
            if json_track:
                tracks.append((language, json_track))
    return tracks


def _caption_result(info: dict[str, Any]) -> dict[str, Any] | None:
    headers = {"User-Agent": "Mozilla/5.0 (compatible; NinjaTranscribe/1.0)"}
    with httpx.Client(timeout=20, follow_redirects=True, headers=headers) as client:
        for language, track in _caption_candidates(info):
            try:
                response = client.get(str(track["url"]))
                if response.status_code != 200 or not response.content:
                    continue
                payload = response.json()
            except (httpx.HTTPError, json.JSONDecodeError, ValueError):
                continue
            segments: list[dict[str, Any]] = []
            for index, event in enumerate(payload.get("events", [])):
                text = "".join(str(part.get("utf8") or "") for part in event.get("segs", [])).strip()
                text = re.sub(r"\s+", " ", text)
                if not text:
                    continue
                start = float(event.get("tStartMs") or 0) / 1000
                end = start + max(float(event.get("dDurationMs") or 0) / 1000, 1.0)
                segments.append({"id": f"yt-{index + 1}", "start": start, "end": end, "text": text})
            if segments:
                return _make_result(info, segments, language, "caption")
    return None


def _download_audio(url: str, temp_dir: Path, progress: ProgressCallback) -> Path:
    progress("downloading_audio", 24, "Đang lấy audio")
    try:
        with yt_dlp.YoutubeDL(_ydl_options(temp_dir, True, progress)) as ydl:
            download_info = ydl.extract_info(url, download=True)
            requested = download_info.get("requested_downloads") if isinstance(download_info, dict) else None
            if isinstance(requested, list):
                for item in requested:
                    filepath = item.get("filepath") if isinstance(item, dict) else None
                    if filepath and Path(filepath).is_file():
                        return Path(filepath)
            prepared = Path(ydl.prepare_filename(download_info)) if isinstance(download_info, dict) else None
            if prepared and prepared.is_file():
                return prepared
    except DownloadError as exc:
        raise _map_youtube_error(exc, audio_download=True) from exc
    except PipelineError:
        raise
    except Exception as exc:
        raise PipelineError("AUDIO_DOWNLOAD_FAILED", "The server could not download this video's audio stream.", 502) from exc

    candidates = [path for path in temp_dir.glob("source.*") if path.is_file()]
    if not candidates:
        raise PipelineError("AUDIO_DOWNLOAD_FAILED", "YouTube did not provide an accessible audio stream.", 502)
    return max(candidates, key=lambda path: path.stat().st_size)


def _make_chunks(audio_path: Path, temp_dir: Path, progress: ProgressCallback) -> list[Path]:
    progress("converting_audio", 50, "Đang lấy audio")
    chunk_dir = temp_dir / "chunks"
    chunk_dir.mkdir()
    chunk_seconds = max(60, int(os.getenv("AUDIO_CHUNK_SECONDS", "600")))
    target = chunk_dir / "chunk-%03d.mp3"
    command = [
        _ffmpeg_binary(), "-hide_banner", "-loglevel", "error", "-y", "-i", str(audio_path),
        "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k",
        "-f", "segment", "-segment_time", str(chunk_seconds), "-reset_timestamps", "1", str(target),
    ]
    try:
        completed = subprocess.run(command, capture_output=True, text=True, timeout=60 * 30, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise PipelineError("AUDIO_CONVERSION_FAILED", "ffmpeg could not prepare the audio for speech recognition.", 500) from exc
    if completed.returncode != 0:
        raise PipelineError("AUDIO_CONVERSION_FAILED", "ffmpeg could not prepare the audio for speech recognition.", 500)
    chunks = sorted(chunk_dir.glob("chunk-*.mp3"))
    if not chunks:
        raise PipelineError("AUDIO_CONVERSION_FAILED", "ffmpeg produced no usable audio chunks.", 500)
    progress("transcribing", 58, "Đang chuyển giọng nói thành text")
    return chunks


def _openai_request(chunk: Path, model: str) -> dict[str, Any]:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise PipelineError("OPENAI_API_KEY_MISSING", "OPENAI_API_KEY is not configured on the transcription backend.", 503)
    base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    if model == "whisper-1":
        data: list[tuple[str, str]] = [
            ("model", model),
            ("response_format", "verbose_json"),
            ("timestamp_granularities[]", "segment"),
        ]
    else:
        data = [("model", model), ("response_format", "diarized_json"), ("chunking_strategy", "auto")]
    timeout = httpx.Timeout(connect=30, read=60 * 15, write=60 * 15, pool=30)
    try:
        with chunk.open("rb") as audio, httpx.Client(timeout=timeout) as client:
            response = client.post(
                f"{base_url}/audio/transcriptions",
                headers={"Authorization": f"Bearer {api_key}"},
                data=data,
                files={"file": (chunk.name, audio, "audio/mpeg")},
            )
    except (OSError, httpx.HTTPError) as exc:
        raise PipelineError("SPEECH_TO_TEXT_FAILED", "The speech-to-text API could not be reached.", 502) from exc
    if response.status_code >= 400:
        detail = response.text[:1000]
        error = PipelineError("SPEECH_TO_TEXT_FAILED", f"The speech-to-text API returned HTTP {response.status_code}.", 502)
        setattr(error, "api_detail", detail)
        raise error
    try:
        return response.json()
    except ValueError as exc:
        raise PipelineError("SPEECH_TO_TEXT_FAILED", "The speech-to-text API returned an unreadable response.", 502) from exc


def _transcribe_chunk(chunk: Path) -> dict[str, Any]:
    model = os.getenv("OPENAI_TRANSCRIBE_MODEL", "gpt-4o-transcribe-diarize").strip()
    try:
        return _openai_request(chunk, model)
    except PipelineError as primary:
        detail = str(getattr(primary, "api_detail", "")).lower()
        can_fallback = primary.code == "SPEECH_TO_TEXT_FAILED" and any(token in detail for token in ("model", "response_format", "chunking_strategy", "diarized_json"))
        fallback = os.getenv("OPENAI_TRANSCRIBE_FALLBACK_MODEL", "whisper-1").strip()
        if can_fallback and fallback and fallback != model:
            return _openai_request(chunk, fallback)
        raise


def _merge_transcriptions(info: dict[str, Any], payloads: list[dict[str, Any]], chunk_seconds: int) -> dict[str, Any]:
    segments: list[dict[str, Any]] = []
    texts: list[str] = []
    language = "Auto-detected"
    for chunk_index, payload in enumerate(payloads):
        offset = chunk_index * chunk_seconds
        text = str(payload.get("text") or "").strip()
        if text:
            texts.append(text)
        language = str(payload.get("language") or language)
        raw_segments = payload.get("segments") or []
        if raw_segments:
            for raw in raw_segments:
                segment_text = str(raw.get("text") or "").strip()
                if not segment_text:
                    continue
                start = offset + float(raw.get("start") or 0)
                end = offset + float(raw.get("end") or raw.get("start") or 0)
                item: dict[str, Any] = {
                    "id": f"stt-{len(segments) + 1}",
                    "start": start,
                    "end": max(end, start + 0.01),
                    "text": segment_text,
                }
                speaker = raw.get("speaker")
                if speaker is not None:
                    item["speaker"] = str(speaker)
                segments.append(item)
        elif text:
            duration = float(payload.get("duration") or chunk_seconds)
            segments.append({"id": f"stt-{len(segments) + 1}", "start": offset, "end": offset + duration, "text": text})

    if not texts and segments:
        texts = [segment["text"] for segment in segments]
    if not texts:
        raise PipelineError("SPEECH_TO_TEXT_FAILED", "No speech could be recognized in this video's audio.", 422)
    return _make_result(info, segments, language, "speech-to-text", " ".join(texts))


def _make_result(info: dict[str, Any], segments: list[dict[str, Any]], language: str, method: str, text: str | None = None) -> dict[str, Any]:
    duration = float(info.get("duration") or 0)
    if not duration and segments:
        duration = max(float(segment["end"]) for segment in segments)
    return {
        "text": text if text is not None else " ".join(str(segment["text"]) for segment in segments),
        "language": language,
        "duration": duration,
        "sourceName": str(info.get("title") or "YouTube video"),
        "sourceKind": "youtube",
        "youtubeUrl": str(info.get("webpage_url") or f"https://www.youtube.com/watch?v={info.get('id', '')}"),
        "segments": segments,
        "speakersDetected": any("speaker" in segment for segment in segments),
        "transcriptionMethod": method,
    }


def run_pipeline(input_url: str, progress: ProgressCallback) -> dict[str, Any]:
    url = canonical_url(input_url)
    progress("reading_video", 8, "Đang đọc video")
    with tempfile.TemporaryDirectory(prefix="ninja-transcribe-") as raw_temp:
        temp_dir = Path(raw_temp)
        info = _extract_info(url, temp_dir, progress)
        progress("reading_video", 16, "Đang đọc video")
        caption_result = _caption_result(info)
        if caption_result:
            progress("completed", 100, "Hoàn thành")
            return caption_result

        if not os.getenv("OPENAI_API_KEY", "").strip():
            raise PipelineError("OPENAI_API_KEY_MISSING", "OPENAI_API_KEY is not configured on the transcription backend.", 503)

        audio_path = _download_audio(url, temp_dir, progress)
        chunks = _make_chunks(audio_path, temp_dir, progress)
        chunk_seconds = max(60, int(os.getenv("AUDIO_CHUNK_SECONDS", "600")))
        payloads: list[dict[str, Any]] = []
        for index, chunk in enumerate(chunks):
            progress("transcribing", 60 + (index / len(chunks)) * 35, "Đang chuyển giọng nói thành text")
            payloads.append(_transcribe_chunk(chunk))
        result = _merge_transcriptions(info, payloads, chunk_seconds)
        progress("completed", 100, "Hoàn thành")
        return result


def cleanup_expired_paths(root: Path, older_than_seconds: int = 6 * 60 * 60) -> int:
    """Defensive cleanup for orphaned temp folders after an unclean process exit."""
    removed = 0
    threshold = time.time() - older_than_seconds
    for path in root.glob("ninja-transcribe-*"):
        try:
            if path.is_dir() and path.stat().st_mtime < threshold:
                shutil.rmtree(path)
                removed += 1
        except OSError:
            continue
    return removed
