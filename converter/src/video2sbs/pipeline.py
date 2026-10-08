"""End-to-end 2D video -> SBS video conversion."""

from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from .depth import DepthEstimator
from .stereo import Layout, make_stereo_pair, pack_sbs
from .temporal import DepthNormalizer, SceneCutDetector
from .video_io import FfmpegWriter, VideoSource


@dataclass
class ConvertOptions:
    layout: Layout = "half"
    max_disparity_pct: float = 2.0
    convergence: float = 0.6
    smoothing: float = 0.5
    max_height: int | None = 1080
    start: float = 0.0
    duration: float | None = None
    crf: int = 20
    preset: str = "medium"


@dataclass
class ConvertResult:
    frames: int
    seconds: float
    width: int
    height: int
    fps: float


Progress = Callable[[int, int, float], None]  # (done, total or 0 if unknown, elapsed seconds)


class _FrameConverter:
    """Stateful per-frame converter (holds the temporal smoothing state)."""

    def __init__(self, estimator: DepthEstimator, options: ConvertOptions) -> None:
        self.estimator = estimator
        self.options = options
        self.normalizer = DepthNormalizer(options.smoothing)
        self.cuts = SceneCutDetector()

    def __call__(self, frame_rgb: np.ndarray) -> np.ndarray:
        o = self.options
        cut = self.cuts.update(frame_rgb)
        depth = self.estimator.estimate(frame_rgb)
        norm = self.normalizer(depth, scene_cut=cut)
        left, right = make_stereo_pair(frame_rgb, norm, o.max_disparity_pct, o.convergence)
        return pack_sbs(left, right, o.layout)


def convert_video(
    input_path: Path,
    output_path: Path,
    estimator: DepthEstimator,
    options: ConvertOptions,
    progress: Progress | None = None,
) -> ConvertResult:
    source = VideoSource(input_path, start=options.start, max_height=options.max_height)
    limit = round(options.duration * source.fps) if options.duration else None
    known = [n for n in (source.total_frames, limit) if n]
    total = min(known) if known else 0

    frames = source.frames(limit)
    first = next(frames, None)
    if first is None:
        source.close()
        raise ValueError(f"影片沒有可讀取的影格：{input_path}")

    convert = _FrameConverter(estimator, options)
    first_out = convert(first)
    out_h, out_w = first_out.shape[:2]
    writer = FfmpegWriter(
        output_path, out_w, out_h, source.fps,
        audio_source=input_path, audio_start=options.start,
        crf=options.crf, preset=options.preset,
    )  # fmt: skip

    t0 = time.monotonic()
    done = 0
    try:
        writer.write(first_out)
        done = 1
        if progress:
            progress(done, total, time.monotonic() - t0)
        for frame in frames:
            writer.write(convert(frame))
            done += 1
            if progress:
                progress(done, total, time.monotonic() - t0)
        writer.close()
    except BaseException:
        writer.abort()
        raise
    finally:
        source.close()
    return ConvertResult(done, time.monotonic() - t0, out_w, out_h, source.fps)


def convert_frame(
    input_path: Path,
    estimator: DepthEstimator,
    options: ConvertOptions,
) -> np.ndarray:
    """Convert a single frame (at ``options.start``) to a packed SBS RGB image, for quick tuning."""
    source = VideoSource(input_path, start=options.start, max_height=options.max_height)
    try:
        first = next(source.frames(1), None)
    finally:
        source.close()
    if first is None:
        raise ValueError(f"影片沒有可讀取的影格：{input_path}")
    return _FrameConverter(estimator, options)(first)


def write_png(path: Path, rgb: np.ndarray) -> None:
    if not cv2.imwrite(str(path), cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)):
        raise OSError(f"無法寫入圖片：{path}")


__all__ = ["ConvertOptions", "ConvertResult", "convert_frame", "convert_video", "write_png"]
