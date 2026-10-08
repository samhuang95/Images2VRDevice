"""Monocular depth estimation backends.

An estimator maps an RGB uint8 frame (H, W, 3) to a float32 map of *relative inverse depth*
(larger = nearer) at any resolution and with an arbitrary per-frame scale; temporal
normalisation is handled in :mod:`video2sbs.temporal`.
"""

from __future__ import annotations

from typing import Protocol

import numpy as np

DEFAULT_MODEL = "depth-anything/Depth-Anything-V2-Small-hf"
_PATCH = 14  # DINOv2 patch size: model input sides must be multiples of it


class DepthEstimator(Protocol):
    def estimate(self, frame_rgb: np.ndarray) -> np.ndarray: ...


def model_input_size(height: int, width: int, infer_size: int = 518) -> tuple[int, int]:
    """Scale so the short side is ``infer_size`` and round both sides to a multiple of 14."""
    scale = infer_size / min(height, width)
    snap = lambda v: max(_PATCH, round(v * scale / _PATCH) * _PATCH)  # noqa: E731
    return snap(height), snap(width)


def resolve_device(device: str = "auto") -> str:
    import torch

    if device != "auto":
        return device
    if torch.cuda.is_available():
        return "cuda"
    if getattr(torch.backends, "mps", None) is not None and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


class DepthAnythingV2:
    """Depth Anything V2 through Hugging Face transformers (Small/Base/Large are Apache-2.0)."""

    _MEAN = (0.485, 0.456, 0.406)
    _STD = (0.229, 0.224, 0.225)

    def __init__(
        self,
        model_id: str = DEFAULT_MODEL,
        device: str = "auto",
        infer_size: int = 518,
        model=None,
    ) -> None:
        import torch
        from transformers import AutoModelForDepthEstimation

        self._torch = torch
        self.device = resolve_device(device)
        self.infer_size = infer_size
        if model is None:
            model = AutoModelForDepthEstimation.from_pretrained(model_id)
        self.model = model.to(self.device).eval()
        self._mean = torch.tensor(self._MEAN, device=self.device).view(1, 3, 1, 1)
        self._std = torch.tensor(self._STD, device=self.device).view(1, 3, 1, 1)

    def estimate(self, frame_rgb: np.ndarray) -> np.ndarray:
        torch = self._torch
        h, w = frame_rgb.shape[:2]
        th, tw = model_input_size(h, w, self.infer_size)

        x = torch.from_numpy(frame_rgb).to(self.device).permute(2, 0, 1)[None].float() / 255.0
        x = torch.nn.functional.interpolate(x, size=(th, tw), mode="bicubic", align_corners=False)
        x = (x.clamp(0.0, 1.0) - self._mean) / self._std

        with torch.inference_mode():
            if self.device == "cuda":
                with torch.autocast("cuda", dtype=torch.float16):
                    out = self.model(pixel_values=x).predicted_depth
            else:
                out = self.model(pixel_values=x).predicted_depth
        return out[0].float().cpu().numpy()
