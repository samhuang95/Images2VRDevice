"""Temporal stabilisation for per-frame monocular depth.

Depth Anything V2 predicts *relative* inverse depth with an arbitrary scale per frame, so
raw output flickers when played back as video. We normalise with smoothed percentile
bounds and blend with the previous frame, resetting on scene cuts.
"""

from __future__ import annotations

import cv2
import numpy as np


class SceneCutDetector:
    """Flags a cut when the mean absolute difference of tiny grayscale thumbnails jumps."""

    def __init__(self, threshold: float = 0.12) -> None:
        self.threshold = threshold
        self._prev: np.ndarray | None = None

    def update(self, frame_rgb: np.ndarray) -> bool:
        gray = cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2GRAY)
        thumb = cv2.resize(gray, (32, 18), interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0
        cut = self._prev is not None and float(np.abs(thumb - self._prev).mean()) > self.threshold
        self._prev = thumb
        return cut


class DepthNormalizer:
    """Maps raw relative inverse depth to [0, 1] where 1 is nearest.

    ``smoothing`` is the weight of the previous frame (0 disables temporal smoothing).
    """

    def __init__(self, smoothing: float = 0.5, lo_pct: float = 2.0, hi_pct: float = 98.0) -> None:
        if not 0.0 <= smoothing < 1.0:
            raise ValueError("smoothing must be in [0, 1)")
        self.smoothing = smoothing
        self.lo_pct = lo_pct
        self.hi_pct = hi_pct
        self._bounds: np.ndarray | None = None
        self._prev: np.ndarray | None = None

    def reset(self) -> None:
        self._bounds = None
        self._prev = None

    def __call__(self, depth: np.ndarray, scene_cut: bool = False) -> np.ndarray:
        if scene_cut or (self._prev is not None and self._prev.shape != depth.shape):
            self.reset()

        bounds = np.percentile(depth, [self.lo_pct, self.hi_pct]).astype(np.float64)
        a = self.smoothing
        if self._bounds is not None:
            bounds = a * self._bounds + (1.0 - a) * bounds
        self._bounds = bounds

        lo, hi = float(bounds[0]), float(bounds[1])
        norm = np.clip((depth - lo) / max(hi - lo, 1e-6), 0.0, 1.0).astype(np.float32)
        if self._prev is not None:
            norm = a * self._prev + (1.0 - a) * norm
        self._prev = norm
        return norm
