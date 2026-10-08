import numpy as np
import pytest

from video2sbs.depth import model_input_size


@pytest.mark.parametrize("h,w", [(1080, 1920), (720, 1280), (480, 640), (1920, 1080), (37, 91)])
def test_model_input_size_is_multiple_of_14_and_keeps_aspect(h, w):
    th, tw = model_input_size(h, w, 518)
    assert th % 14 == 0 and tw % 14 == 0 and th >= 14 and tw >= 14
    assert (tw / th) == pytest.approx(w / h, rel=0.06) or min(h, w) < 100


def test_wrapper_runs_with_tiny_random_model():
    torch = pytest.importorskip("torch")
    from transformers import DepthAnythingConfig, DepthAnythingForDepthEstimation, Dinov2Config

    from video2sbs.depth import DepthAnythingV2

    backbone = Dinov2Config(
        hidden_size=32, num_hidden_layers=4, num_attention_heads=2, intermediate_size=64,
        image_size=518, patch_size=14, out_indices=[1, 2, 3, 4],
        apply_layernorm=True, reshape_hidden_states=False,
    )  # fmt: skip
    config = DepthAnythingConfig(
        backbone_config=backbone, reassemble_hidden_size=32, neck_hidden_sizes=[8, 16, 24, 32],
        fusion_hidden_size=16, head_hidden_size=8, patch_size=14,
    )  # fmt: skip
    torch.manual_seed(0)
    estimator = DepthAnythingV2(model=DepthAnythingForDepthEstimation(config), device="cpu", infer_size=112)
    frame = np.random.default_rng(0).integers(0, 255, size=(90, 160, 3), dtype=np.uint8)
    depth = estimator.estimate(frame)
    assert depth.dtype == np.float32 and depth.shape == model_input_size(90, 160, 112)
    assert np.isfinite(depth).all()
