import numpy as np
import pytest

from video2sbs.temporal import DepthNormalizer, SceneCutDetector


def test_normalizer_output_range_and_orientation():
    depth = np.linspace(5.0, 50.0, 100 * 100, dtype=np.float32).reshape(100, 100)
    norm = DepthNormalizer(smoothing=0.0)(depth)
    assert norm.min() >= 0.0 and norm.max() <= 1.0
    assert norm[-1, -1] > norm[0, 0]  # larger raw value stays "nearer"


def test_smoothing_blends_with_previous_frame_and_resets_on_cut():
    a = np.zeros((20, 20), np.float32)
    a[:, 10:] = 10.0
    b = a[:, ::-1].copy()
    n = DepthNormalizer(smoothing=0.5)
    n(a)
    blended = n(b)
    assert 0.2 < blended[:, 0].mean() < 0.8  # not a hard flip yet
    n2 = DepthNormalizer(smoothing=0.5)
    n2(a)
    cut = n2(b, scene_cut=True)
    assert cut[:, 0].mean() > 0.9  # reset: follows the new frame fully


def test_invalid_smoothing_rejected():
    with pytest.raises(ValueError):
        DepthNormalizer(smoothing=1.0)


def test_scene_cut_detector():
    det = SceneCutDetector()
    dark = np.zeros((90, 160, 3), np.uint8)
    bright = np.full((90, 160, 3), 255, np.uint8)
    assert det.update(dark) is False
    assert det.update(dark) is False
    assert det.update(bright) is True
