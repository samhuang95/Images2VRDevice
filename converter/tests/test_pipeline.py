import subprocess

import cv2
import numpy as np
import pytest

from video2sbs.pipeline import ConvertOptions, convert_frame, convert_video
from video2sbs.video_io import find_ffmpeg


class HorizontalRampDepth:
    """Stub estimator: depth increases to the right (arbitrary scale, like the real model)."""

    def estimate(self, frame_rgb):
        h, w = frame_rgb.shape[:2]
        return np.tile(np.linspace(1.0, 9.0, w, dtype=np.float32), (h, 1))


@pytest.fixture(scope="module")
def sample_video(tmp_path_factory):
    path = tmp_path_factory.mktemp("media") / "in.mp4"
    subprocess.run(
        [
            find_ffmpeg(), "-y", "-loglevel", "error",
            "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=10:duration=1",
            "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(path),
        ],
        check=True,
    )  # fmt: skip
    return path


def _probe(path):
    cap = cv2.VideoCapture(str(path))
    info = (int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
            int(cap.get(cv2.CAP_PROP_FRAME_COUNT)))  # fmt: skip
    cap.release()
    return info


def _has_audio(path):
    proc = subprocess.run([find_ffmpeg(), "-i", str(path)], capture_output=True, text=True)
    return "Audio:" in proc.stderr


@pytest.mark.parametrize("layout,width", [("half", 320), ("full", 640)])
def test_convert_video(sample_video, tmp_path, layout, width):
    out = tmp_path / "out.mp4"
    seen = []
    result = convert_video(
        sample_video, out, HorizontalRampDepth(), ConvertOptions(layout=layout, preset="ultrafast"),
        progress=lambda done, total, elapsed: seen.append((done, total)),
    )  # fmt: skip
    w, h, frames = _probe(out)
    assert (w, h) == (width, 180)
    assert frames == result.frames == 10
    assert seen[-1] == (10, 10)
    assert _has_audio(out)


def test_duration_limits_frames(sample_video, tmp_path):
    out = tmp_path / "short.mp4"
    result = convert_video(
        sample_video, out, HorizontalRampDepth(), ConvertOptions(duration=0.3, preset="ultrafast")
    )
    assert result.frames == 3


def test_max_height_downscales_and_keeps_even_dims(sample_video, tmp_path):
    out = tmp_path / "small.mp4"
    convert_video(
        sample_video, out, HorizontalRampDepth(), ConvertOptions(max_height=90, preset="ultrafast")
    )
    w, h, _ = _probe(out)
    assert (w, h) == (160, 90)


def test_convert_frame_returns_packed_rgb(sample_video):
    img = convert_frame(sample_video, HorizontalRampDepth(), ConvertOptions(layout="full"))
    assert img.shape == (180, 640, 3) and img.dtype == np.uint8


def test_missing_video_raises(tmp_path):
    with pytest.raises(ValueError):
        convert_video(tmp_path / "nope.mp4", tmp_path / "o.mp4", HorizontalRampDepth(), ConvertOptions())
