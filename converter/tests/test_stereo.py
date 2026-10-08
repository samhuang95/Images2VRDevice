import numpy as np
import pytest

from video2sbs.stereo import disparity_from_depth, make_stereo_pair, pack_sbs, warp_eye

H, W = 180, 320


def _scene():
    """Noisy dark background (far) with a bright square (near) in the middle."""
    rng = np.random.default_rng(1)
    frame = rng.integers(0, 120, size=(H, W, 3), dtype=np.uint8)
    depth = np.zeros((H, W), np.float32)
    frame[60:120, 130:190] = 255
    depth[60:120, 130:190] = 1.0
    return frame, depth


def _block_centroid_x(img):
    ys, xs = np.nonzero(img.min(axis=2) > 200)
    return xs.mean()


def test_near_object_is_shifted_right_in_left_eye():
    frame, depth = _scene()
    left, right = make_stereo_pair(frame, depth, max_disparity_pct=4.0, convergence=0.5)
    # near disparity = (1 - 0.5) * 4% * 320 = 6.4 px total -> left sees it ~+3.2, right ~-3.2
    dx = _block_centroid_x(left) - _block_centroid_x(right)
    assert dx == pytest.approx(6.4, abs=1.5)


def test_object_on_convergence_plane_has_no_parallax():
    frame, _ = _scene()
    depth = np.full((H, W), 0.6, np.float32)
    left, right = make_stereo_pair(frame, depth, max_disparity_pct=4.0, convergence=0.6)
    assert np.abs(left.astype(int) - frame).max() <= 1
    assert np.abs(right.astype(int) - frame).max() <= 1


def test_far_scene_has_opposite_parallax():
    frame, _ = _scene()
    depth = np.zeros((H, W), np.float32)  # everything behind the screen plane
    left, right = make_stereo_pair(frame, depth, max_disparity_pct=4.0, convergence=0.5)
    assert _block_centroid_x(left) - _block_centroid_x(right) == pytest.approx(-6.4, abs=1.5)


def test_disocclusion_shows_background_not_smeared_foreground():
    frame, depth = _scene()
    left, _ = make_stereo_pair(frame, depth, max_disparity_pct=4.0, convergence=0.5)
    # left eye: the near block moves right, so the strip it uncovers (just left of where
    # the block now starts) must be filled from the dark background, not bright block pixels
    revealed = left[70:110, 124:131]
    assert revealed.max() < 150


def test_output_shape_dtype_and_no_black_holes():
    frame, depth = _scene()
    for eye in ("left", "right"):
        out = warp_eye(frame, disparity_from_depth(depth, 4.0, 0.5), eye)
        assert out.shape == frame.shape and out.dtype == np.uint8
        # background is noise in [0, 120): any disocclusion hole must be filled from it,
        # not left as pure black
        assert (out.max(axis=2) == 0).mean() < 0.01


def test_depth_map_of_different_resolution_is_accepted():
    frame, depth = _scene()
    small = depth[::3, ::3]
    left, right = make_stereo_pair(frame, small)
    assert left.shape == frame.shape and right.shape == frame.shape


@pytest.mark.parametrize("layout,expected", [("half", (H, W)), ("full", (H, 2 * W))])
def test_pack_sbs_shapes(layout, expected):
    frame, _ = _scene()
    packed = pack_sbs(frame, frame, layout)
    assert packed.shape[:2] == expected


def test_half_sbs_keeps_left_in_left_half():
    left = np.zeros((H, W, 3), np.uint8)
    right = np.full((H, W, 3), 255, np.uint8)
    packed = pack_sbs(left, right, "half")
    assert packed[:, : W // 2].max() == 0 and packed[:, W // 2 :].min() == 255
