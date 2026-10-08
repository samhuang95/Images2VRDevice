"""Depth-image-based rendering (DIBR): build a left/right eye pair from one frame + depth.

Conventions
-----------
* ``norm_depth`` is in [0, 1], 1 = nearest.
* Disparity is signed, expressed as a fraction of image width, and is the *total*
  left-minus-right separation of a point. Positive = in front of the screen (the left eye
  sees it shifted right, the right eye shifted left), negative = behind the screen.
* Each eye is shifted by half the disparity.

For each eye we forward-splat only the (low resolution) disparity map into the target
view, keeping the nearest surface, and record which *source column* feeds every target
column. Disocclusion holes copy the source column of their farther neighbour (so they show
stretched background, never smeared foreground). The colour image is then pulled with a
backward ``cv2.remap``.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

import cv2
import numpy as np

Eye = Literal["left", "right"]
Layout = Literal["half", "full"]



def disparity_from_depth(
    norm_depth: np.ndarray, max_disparity_pct: float, convergence: float
) -> np.ndarray:
    """Normalised depth -> signed disparity (fraction of image width).

    ``max_disparity_pct`` is the near-to-far range as a percentage of image width.
    ``convergence`` is the normalised depth that lands exactly on the screen plane.
    """
    return ((norm_depth - convergence) * (max_disparity_pct / 100.0)).astype(np.float32)


def _splat(disp: np.ndarray, sign: float) -> np.ndarray:
    h, w = disp.shape
    cols = np.arange(w, dtype=np.float32)[None, :]
    target = np.rint(cols + sign * disp * (w / 2.0)).astype(np.int64)
    valid = (target >= 0) & (target < w)
    rows = np.arange(h, dtype=np.int64)[:, None]
    flat = (rows * w + target)[valid]
    buf = np.full(h * w, -np.inf, dtype=np.float32)
    np.maximum.at(buf, flat, disp[valid])  # nearest (largest disparity) wins
    return buf.reshape(h, w)


def _source_columns(disp: np.ndarray, sign: float) -> np.ndarray:
    """Source column (in ``disp`` pixel units) feeding each target column of the new view."""
    h, w = disp.shape
    nearest = _splat(disp, sign)
    valid = np.isfinite(nearest)
    cols = np.broadcast_to(np.arange(w, dtype=np.float32)[None, :], (h, w))
    src = np.where(valid, cols - sign * np.where(valid, nearest, 0.0) * (w / 2.0), cols)
    if valid.all():
        return src.astype(np.float32)

    # nearest valid pixel to the left / right of every pixel, per row
    idx = np.arange(w)[None, :]
    left = np.maximum.accumulate(np.where(valid, idx, -1), axis=1)
    right = np.minimum.accumulate(np.where(valid, idx, w)[:, ::-1], axis=1)[:, ::-1]
    rows = np.arange(h)[:, None]
    d_left = np.where(left >= 0, nearest[rows, np.clip(left, 0, w - 1)], np.inf)
    d_right = np.where(right < w, nearest[rows, np.clip(right, 0, w - 1)], np.inf)
    pick = np.where(d_left <= d_right, left, right)  # farther surface = smaller disparity
    pick_ok = (pick >= 0) & (pick < w)
    filled = np.where(pick_ok, src[rows, np.clip(pick, 0, w - 1)], cols)
    return np.where(valid, src, filled).astype(np.float32)


@lru_cache(maxsize=4)
def _rows(h: int, w: int) -> np.ndarray:
    rows = np.broadcast_to(np.arange(h, dtype=np.float32)[:, None], (h, w)).copy()
    rows.setflags(write=False)
    return rows


def warp_eye(frame: np.ndarray, disparity: np.ndarray, eye: Eye, splat_width: int = 480) -> np.ndarray:
    """Render one eye from ``frame`` (H, W, C) and ``disparity`` (any size, width fraction)."""
    h, w = frame.shape[:2]
    sign = 1.0 if eye == "left" else -1.0

    sw = min(splat_width, w)
    sh = max(1, round(h * sw / w))
    interp = cv2.INTER_AREA if disparity.shape[1] > sw else cv2.INTER_LINEAR
    small = cv2.resize(disparity, (sw, sh), interpolation=interp)

    src = _source_columns(small, sign)
    scale = w / sw
    map_x = (cv2.resize(src, (w, h), interpolation=cv2.INTER_LINEAR) + 0.5) * scale - 0.5
    return cv2.remap(
        frame, map_x, _rows(h, w), interpolation=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE
    )


def make_stereo_pair(
    frame: np.ndarray,
    norm_depth: np.ndarray,
    max_disparity_pct: float = 2.0,
    convergence: float = 0.6,
    splat_width: int = 480,
) -> tuple[np.ndarray, np.ndarray]:
    disp = disparity_from_depth(norm_depth, max_disparity_pct, convergence)
    return (
        warp_eye(frame, disp, "left", splat_width),
        warp_eye(frame, disp, "right", splat_width),
    )


def pack_sbs(left: np.ndarray, right: np.ndarray, layout: Layout = "half") -> np.ndarray:
    """Pack eyes side by side. ``half`` squeezes each eye to half width (same frame size as the
    source, widest decoder compatibility); ``full`` keeps full resolution (twice as wide)."""
    if layout == "full":
        return np.hstack([left, right])
    h, w = left.shape[:2]
    half = w // 2
    squeeze = lambda img: cv2.resize(img, (half, h), interpolation=cv2.INTER_AREA)  # noqa: E731
    return np.hstack([squeeze(left), squeeze(right)])
