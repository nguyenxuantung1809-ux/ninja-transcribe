from __future__ import annotations

import tempfile
import os
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from app.pipeline import PipelineError, _map_youtube_error, _merge_transcriptions, _openai_request, _ydl_options, cleanup_expired_paths, extract_video_id


class YouTubeUrlTests(unittest.TestCase):
    def test_supported_urls(self) -> None:
        expected = "Y6-g_9ASXTU"
        self.assertEqual(extract_video_id(f"https://www.youtube.com/watch?v={expected}&t=63s"), expected)
        self.assertEqual(extract_video_id(f"https://youtu.be/{expected}?si=abc"), expected)
        self.assertEqual(extract_video_id(f"https://youtube.com/shorts/{expected}"), expected)

    def test_rejects_non_youtube_and_playlist_only_urls(self) -> None:
        for value in ("https://example.com/watch?v=Y6-g_9ASXTU", "https://youtube.com/playlist?list=abc", "not a url"):
            with self.subTest(value=value), self.assertRaises(PipelineError) as context:
                extract_video_id(value)
            self.assertEqual(context.exception.code, "INVALID_URL")


class TranscriptMergeTests(unittest.TestCase):
    def test_chunks_are_merged_in_order_with_timestamp_offsets(self) -> None:
        info = {"id": "Y6-g_9ASXTU", "title": "Example", "duration": 700, "webpage_url": "https://youtu.be/Y6-g_9ASXTU"}
        payloads = [
            {"text": "first", "language": "en", "segments": [{"start": 1, "end": 2, "text": "first", "speaker": "A"}]},
            {"text": "second", "language": "en", "segments": [{"start": 3, "end": 4, "text": "second", "speaker": "B"}]},
        ]
        result = _merge_transcriptions(info, payloads, 600)
        self.assertEqual(result["text"], "first second")
        self.assertEqual(result["segments"][1]["start"], 603)
        self.assertEqual(result["segments"][1]["speaker"], "B")
        self.assertTrue(result["speakersDetected"])


class ErrorMappingTests(unittest.TestCase):
    def test_youtube_failures_remain_distinct(self) -> None:
        cases = {
            "This is a private video": "PRIVATE_VIDEO",
            "Sign in to confirm your age": "LOGIN_REQUIRED",
            "This video is unavailable": "VIDEO_UNAVAILABLE",
            "HTTP Error 429 Too Many Requests": "YOUTUBE_RATE_LIMITED",
            "HTTP Error 403 Forbidden": "YOUTUBE_ACCESS_DENIED",
            "LOGIN_REQUIRED: Sign in to confirm you’re not a bot": "YOUTUBE_BOT_VERIFICATION",
        }
        for message, code in cases.items():
            with self.subTest(message=message):
                self.assertEqual(_map_youtube_error(RuntimeError(message)).code, code)
        self.assertEqual(_map_youtube_error(RuntimeError("download stopped"), audio_download=True).code, "AUDIO_DOWNLOAD_FAILED")
        self.assertNotEqual(_map_youtube_error(RuntimeError("Requested format is not available")).code, "VIDEO_UNAVAILABLE")

    def test_proxy_credentials_are_redacted_from_server_diagnostics(self) -> None:
        error = _map_youtube_error(RuntimeError("HTTP Error 403 via https://user:password@proxy.example:8443"))
        self.assertEqual(error.code, "YOUTUBE_ACCESS_DENIED")
        self.assertNotIn("password", error.internal_detail or "")

    def test_missing_api_key_stays_server_side(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            audio = Path(raw) / "chunk.mp3"
            audio.write_bytes(b"not-real-audio")
            with patch.dict(os.environ, {"OPENAI_API_KEY": ""}):
                with self.assertRaises(PipelineError) as context:
                    _openai_request(audio, "whisper-1")
        self.assertEqual(context.exception.code, "OPENAI_API_KEY_MISSING")
        self.assertNotIn("OPENAI_API_KEY", context.exception.public_message)


class YouTubeRuntimeTests(unittest.TestCase):
    def test_node_ejs_and_pot_provider_are_enabled(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            options = _ydl_options(Path(raw), False, lambda *_: None)
        self.assertEqual(options["js_runtimes"], {"node": {}})
        self.assertEqual(options["extractor_args"]["youtube"]["player_client"], ["mweb", "web_safari"])
        self.assertEqual(options["extractor_args"]["youtubepot-bgutilhttp"]["base_url"], ["http://127.0.0.1:4416"])


class CleanupTests(unittest.TestCase):
    def test_orphan_cleanup_only_targets_pipeline_directories(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            target = root / "ninja-transcribe-old"
            unrelated = root / "keep-me"
            target.mkdir()
            unrelated.mkdir()
            old = time.time() - 60
            os.utime(target, (old, old))
            self.assertEqual(cleanup_expired_paths(root, older_than_seconds=0), 1)
            self.assertFalse(target.exists())
            self.assertTrue(unrelated.exists())


if __name__ == "__main__":
    unittest.main()
