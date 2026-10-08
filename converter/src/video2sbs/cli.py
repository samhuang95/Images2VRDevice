"""Command line entry point: ``video2sbs input.mp4 -o output_hsbs.mp4``."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .depth import DEFAULT_MODEL
from .pipeline import ConvertOptions, convert_frame, convert_video, write_png


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="video2sbs",
        description="把一般 2D 影片轉成左右並排 (SBS) 立體影片，供手機放進 Cardboard 紙盒觀看。",
    )
    p.add_argument("input", type=Path, help="輸入影片")
    p.add_argument(
        "-o", "--output", type=Path,
        help="輸出檔（預設：<輸入檔名>_hsbs.mp4 或 _fsbs.mp4，放在輸入檔旁邊）",
    )  # fmt: skip
    p.add_argument(
        "--layout", choices=["half", "full"], default="half",
        help="half：每眼水平壓縮一半，畫面尺寸不變、手機最相容（預設）；full：每眼完整解析度，寬度加倍",
    )  # fmt: skip
    p.add_argument(
        "--max-disparity", type=float, default=2.0, metavar="PCT",
        help="最近到最遠的視差範圍，占畫面寬度的百分比（預設 2.0；越大立體感越強也越容易不適）",
    )  # fmt: skip
    p.add_argument(
        "--convergence", type=float, default=0.6, metavar="0..1",
        help="落在螢幕平面上的相對深度，0=最遠、1=最近（預設 0.6；越大物體越往螢幕後方退）",
    )  # fmt: skip
    p.add_argument(
        "--smooth", type=float, default=0.5, metavar="0..1",
        help="深度的時間平滑（前一幀的權重，預設 0.5；0 關閉，越大越穩但動態物體越容易拖影）",
    )  # fmt: skip
    p.add_argument("--max-height", type=int, default=1080, help="輸入高度超過時先縮小（預設 1080，0=不縮小）")
    p.add_argument("--start", type=float, default=0.0, metavar="SEC", help="從第幾秒開始（預設 0）")
    p.add_argument("--duration", type=float, metavar="SEC", help="只轉換這麼多秒（預設轉完整支）")
    p.add_argument("--crf", type=int, default=20, help="x264 品質，越小越好越大檔（預設 20）")
    p.add_argument("--preset", default="medium", help="x264 速度預設（預設 medium）")
    p.add_argument("--model", default=DEFAULT_MODEL, help=f"深度模型（預設 {DEFAULT_MODEL}）")
    p.add_argument("--device", default="auto", help="auto / cpu / cuda / mps（預設 auto）")
    p.add_argument("--infer-size", type=int, default=518, help="深度模型輸入的短邊（預設 518，需為 14 的倍數較佳）")
    p.add_argument(
        "--preview", type=Path, metavar="PNG",
        help="只轉換 --start 那一格並輸出成 PNG，用來快速調整視差參數（不編碼影片）",
    )  # fmt: skip
    return p


def _progress(done: int, total: int, elapsed: float) -> None:
    fps = done / elapsed if elapsed > 0 else 0.0
    if total:
        eta = (total - done) / fps if fps > 0 else 0.0
        msg = f"\r影格 {done}/{total} ({done * 100 // total}%)  {fps:.2f} fps  剩餘約 {eta:.0f} 秒"
    else:
        msg = f"\r影格 {done}  {fps:.2f} fps"
    sys.stderr.write(msg + " " * 4)
    sys.stderr.flush()


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    if not args.input.is_file():
        print(f"找不到輸入檔：{args.input}", file=sys.stderr)
        return 2
    if not 0.0 <= args.convergence <= 1.0:
        print("--convergence 必須介於 0 到 1", file=sys.stderr)
        return 2
    if not 0.0 <= args.smooth < 1.0:
        print("--smooth 必須 >= 0 且 < 1", file=sys.stderr)
        return 2

    options = ConvertOptions(
        layout=args.layout,
        max_disparity_pct=args.max_disparity,
        convergence=args.convergence,
        smoothing=args.smooth,
        max_height=args.max_height or None,
        start=args.start,
        duration=args.duration,
        crf=args.crf,
        preset=args.preset,
    )

    from .depth import DepthAnythingV2  # heavy import (torch); keep --help fast

    print(f"載入深度模型 {args.model} …（第一次執行會下載權重）", file=sys.stderr)
    try:
        estimator = DepthAnythingV2(args.model, device=args.device, infer_size=args.infer_size)
    except OSError as e:
        print(
            f"無法載入深度模型：{e}\n"
            "請確認可連線到 huggingface.co，或用 --model 指定已下載的本機資料夾。",
            file=sys.stderr,
        )
        return 1
    print(f"裝置：{estimator.device}", file=sys.stderr)

    if args.preview:
        write_png(args.preview, convert_frame(args.input, estimator, options))
        print(f"已輸出預覽：{args.preview}", file=sys.stderr)
        return 0

    suffix = "hsbs" if args.layout == "half" else "fsbs"
    output = args.output or args.input.with_name(f"{args.input.stem}_{suffix}.mp4")
    result = convert_video(args.input, output, estimator, options, _progress)
    sys.stderr.write("\n")
    print(
        f"完成：{output}  ({result.width}x{result.height} @ {result.fps:.2f} fps, "
        f"{result.frames} 格, 耗時 {result.seconds:.0f} 秒)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
