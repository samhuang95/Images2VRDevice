"""Video decoding (OpenCV) and encoding (ffmpeg pipe, audio copied from the source)."""

from __future__ import annotations

import math
import shutil
import subprocess
import tempfile
from collections.abc import Iterator
from pathlib import Path

import cv2
import numpy as np


def find_ffmpeg() -> str:
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    import imageio_ffmpeg

    return imageio_ffmpeg.get_ffmpeg_exe()


class VideoSource:
    """Yields RGB uint8 frames, optionally downscaled to ``max_height`` and cropped to even sizes."""

    def __init__(self, path: Path, start: float = 0.0, max_height: int | None = None) -> None:
        self.path = Path(path)
        self.start = max(0.0, start)
        self.max_height = max_height
        self._cap = cv2.VideoCapture(str(self.path))
        if not self._cap.isOpened():
            raise ValueError(f"無法開啟影片：{self.path}")
        fps = self._cap.get(cv2.CAP_PROP_FPS)
        self.fps = fps if fps and math.isfinite(fps) and fps > 0 else 30.0
        total = self._cap.get(cv2.CAP_PROP_FRAME_COUNT)
        total = int(total) if total and math.isfinite(total) and total > 0 else 0
        self.total_frames = max(0, total - round(self.start * self.fps)) if total else 0
        if self.start:
            self._cap.set(cv2.CAP_PROP_POS_MSEC, self.start * 1000.0)

    def _prepare(self, bgr: np.ndarray) -> np.ndarray:
        h, w = bgr.shape[:2]
        if self.max_height and h > self.max_height:
            scale = self.max_height / h
            bgr = cv2.resize(bgr, (round(w * scale), self.max_height), interpolation=cv2.INTER_AREA)
            h, w = bgr.shape[:2]
        bgr = bgr[: h - h % 2, : w - w % 2]
        return np.ascontiguousarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))

    def frames(self, limit: int | None = None) -> Iterator[np.ndarray]:
        count = 0
        while limit is None or count < limit:
            ok, bgr = self._cap.read()
            if not ok:
                break
            count += 1
            yield self._prepare(bgr)

    def close(self) -> None:
        self._cap.release()


class FfmpegWriter:
    """Pipes raw RGB frames into libx264/yuv420p and muxes the source audio (if any)."""

    def __init__(
        self,
        output: Path,
        width: int,
        height: int,
        fps: float,
        audio_source: Path | None = None,
        audio_start: float = 0.0,
        crf: int = 20,
        preset: str = "medium",
    ) -> None:
        cmd = [
            find_ffmpeg(), "-y", "-loglevel", "error",
            "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{width}x{height}",
            "-r", f"{fps:.6f}", "-i", "pipe:0",
        ]  # fmt: skip
        if audio_source is not None:
            if audio_start:
                cmd += ["-ss", f"{audio_start:.3f}"]
            cmd += ["-i", str(audio_source)]
        cmd += ["-map", "0:v:0"]
        if audio_source is not None:
            cmd += ["-map", "1:a:0?", "-c:a", "aac", "-b:a", "160k", "-shortest"]
        cmd += [
            "-c:v", "libx264", "-preset", preset, "-crf", str(crf),
            "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(output),
        ]  # fmt: skip
        self._stderr = tempfile.TemporaryFile()
        self._proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=self._stderr)

    def write(self, frame_rgb: np.ndarray) -> None:
        assert self._proc.stdin is not None
        try:
            self._proc.stdin.write(np.ascontiguousarray(frame_rgb).tobytes())
        except BrokenPipeError:
            raise RuntimeError(f"ffmpeg 提前結束：{self._read_stderr()}") from None

    def close(self) -> None:
        if self._proc.stdin and not self._proc.stdin.closed:
            self._proc.stdin.close()
        code = self._proc.wait()
        if code != 0:
            raise RuntimeError(f"ffmpeg 失敗（exit {code}）：{self._read_stderr()}")
        self._stderr.close()

    def abort(self) -> None:
        self._proc.kill()
        self._proc.wait()
        self._stderr.close()

    def _read_stderr(self) -> str:
        self._stderr.seek(0)
        return self._stderr.read().decode(errors="replace").strip()
