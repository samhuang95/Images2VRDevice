# video2sbs

把一般 2D 影片轉成左右並排（SBS）立體影片。使用 Depth Anything V2 估計深度，再用 depth-image-based rendering 產生左右眼。

```bash
uv sync                                          # 安裝依賴（含 PyTorch，檔案很大）
uv run video2sbs input.mp4                       # → input_hsbs.mp4
uv run video2sbs input.mp4 --layout full         # 每眼完整解析度 → input_fsbs.mp4
uv run video2sbs input.mp4 --preview p.png       # 只轉一格，輸出 PNG 方便調參數
uv run video2sbs input.mp4 --start 30 --duration 10
uv run video2sbs --help
```

## 調整立體感

| 參數 | 預設 | 說明 |
|---|---|---|
| `--max-disparity` | 2.0 | 最近到最遠的視差範圍，占畫面寬度 %。越大越立體，也越容易頭暈、邊緣瑕疵越明顯 |
| `--convergence` | 0.6 | 落在螢幕平面的相對深度（0 最遠、1 最近）。越大，物體越往螢幕後面退（較舒服）；越小越往前凸出 |
| `--smooth` | 0.5 | 深度的前後幀平滑。0 關閉；越大越穩但移動物體越容易拖影 |
| `--max-height` | 1080 | 輸入高度超過就先縮小（0 = 不縮）。手機播放 1080p 即可 |
| `--layout` | half | `half` 每眼壓縮成一半寬，檔案尺寸等於原片，手機最相容；`full` 寬度加倍 |

建議流程：先 `--preview` 看一格 → 調參數 → `--duration 10` 試轉一小段 → 轉整支。

預設模型是 `depth-anything/Depth-Anything-V2-Small-hf`（Apache-2.0），可用 `--model` 換成 Base / Large 版本。
Giant 版授權為 CC-BY-NC，不可商用。`--device` 可指定 `cpu` / `cuda` / `mps`（預設自動偵測）。

## 開發

```bash
uv run pytest
```

| 檔案 | 職責 |
|---|---|
| `cli.py` | 命令列介面 |
| `pipeline.py` | 整支影片 / 單格的轉換流程 |
| `depth.py` | 深度模型（Depth Anything V2）包裝 |
| `temporal.py` | 深度正規化、時間平滑、換場偵測 |
| `stereo.py` | 視差計算、左右眼位移與補洞、SBS 打包 |
| `video_io.py` | OpenCV 讀影格、ffmpeg 編碼並保留原音軌（找不到系統 ffmpeg 時使用 `imageio-ffmpeg` 內建的） |
