# Images2VRDevice

把影片轉成立體（左右並排，SBS），再用手機放進 **Cardboard 紙盒**觀看的簡易 VR 工具。

```
一般 2D 影片 ──► converter（Python）──► xxx_hsbs.mp4 ──► web（Vue 3 + three.js）──► 手機放進紙盒
                 深度估計 + 視差位移                       分左右眼、鏡片畸變校正、陀螺儀
```

| 目錄 | 內容 | 技術 |
|---|---|---|
| [`converter/`](converter/README.md) | 2D 影片 → 左右並排立體影片（CLI） | Python、uv、PyTorch、Depth Anything V2、OpenCV、ffmpeg |
| [`web/`](web/README.md) | 手機瀏覽器上的 VR 播放器 | Vue 3、Vite、TypeScript、three.js |

兩邊透過「檔案」銜接：converter 輸出 `名稱_hsbs.mp4`，在網頁選這個檔案，播放器會從檔名自動判斷格式。
影片不會上傳到任何伺服器，全程在手機本機播放。

## 快速開始

### 1. 轉換影片（電腦上做）

```bash
cd converter
uv sync                                        # 第一次會下載 PyTorch，檔案很大
uv run video2sbs 我的影片.mp4 --preview p.png   # 先轉一格看效果、調參數
uv run video2sbs 我的影片.mp4 --duration 10     # 試轉 10 秒
uv run video2sbs 我的影片.mp4                   # 輸出 我的影片_hsbs.mp4
```

第一次執行會從 Hugging Face 下載 Depth Anything V2 Small 權重（約 100 MB）。沒有 GPU 時用 CPU，
每格約數百毫秒到數秒，建議先用 `--duration` 試。

### 2. 在手機上觀看

```bash
cd web
npm install
npm run dev        # 會顯示 https://<電腦的區網 IP>:5173
```

1. 手機和電腦連同一個 Wi-Fi，用手機瀏覽器開那個網址（自簽憑證，需按「繼續前往」）。
   iPhone 一定要 HTTPS 才能用陀螺儀。
2. 把轉好的影片放到手機（AirDrop、雲端硬碟、USB 都可以），在頁面選這個檔案。
3. 按「進入 VR」，倒數期間把手機橫放進紙盒。點一下螢幕＝播放／暫停（Cardboard 的按鈕就是點螢幕），長按約 1 秒＝離開。
4. 看起來歪斜、重影或不舒服時，先按「校準模式」（不需影片），到「手機與紙盒參數」調整，直到格線是直的、
   左右眼畫面能合成一個。

要給別人用或長期使用，可 `npm run build`，把 `web/dist/` 放到任何靜態空間（S3 + CloudFront、GitHub Pages 皆可，
需 HTTPS）。

## 這個專案怎麼運作

**轉換（`converter/`）**
1. 每格用 Depth Anything V2 估計相對深度（越大越近）。
2. 時間平滑：對深度範圍與深度圖做前後幀平滑並偵測換場，避免影片閃爍。
3. 依深度算出每個像素的視差（`--max-disparity`、`--convergence` 控制），產生左右眼畫面；被遮住露出的區域用鄰近背景延伸，不會拖出前景。
4. 左右並排打包成 H.264 MP4，原音軌一併保留。`half`（預設）每眼水平壓縮一半，尺寸不變、手機最相容；`full` 每眼完整解析度。

**播放（`web/`）**
- 手機橫向全螢幕，左半畫面給左眼、右半給右眼。
- 一個 fragment shader 對每個畫素：反推鏡片畸變 → 套用陀螺儀頭部姿態 → 與 3 公尺外的虛擬螢幕求交 → 直接從影片取樣。
  效果是一面固定在空間中的電影螢幕，轉頭時螢幕不動。
- 鏡片參數沿用 Google Cardboard 的 viewer profile（螢幕尺寸、鏡片間距、螢幕到鏡片距離、k1/k2），可在頁面調整並存在瀏覽器。

## 驗證狀態

已驗證：
- converter：25 個 pytest（左右眼位移方向、遮擋補洞、時間平滑、影片進出與音軌、深度模型包裝層以隨機權重的小模型跑過）。
- web：36 個 vitest（版面、鏡片幾何、陀螺儀姿態與歸零、設定存取）、型別檢查、ESLint/oxlint、`vite build`。
- 無頭 Chromium：校準格線與畸變、SBS 影片左眼取左半／右眼取右半、自動偵測 `_hsbs`、點擊暫停、長按離開。

**尚未驗證（請你實測後回報）**
- 真實的 Depth Anything V2 權重：開發環境無法連到 Hugging Face 的權重下載網域，所以沒有用真實模型轉過影片，
  深度品質、預設視差值（`--max-disparity 2.0`、`--convergence 0.6`）是否舒適需要你看實際成果再調。
- 實體手機與紙盒：陀螺儀方向（含 iPhone 權限流程）、全螢幕與橫向鎖定、倒數後自動播放、鏡片畸變預設值對一般紙盒是否合適。
  Google 的 k1/k2 只對官方款紙盒保證，山寨紙盒可能要調。
- 手機上的 H.264 解碼（無頭 Chromium 不含 H.264，測試用 VP9 WebM）。

## 已知限制

- 單張影像估深度本身有歧義；反光、透明、細小物件容易出錯，且快速移動的物體可能有輕微拖影。
- 目前是「固定在前方的電影螢幕」模式，不支援 360° / 180° 影片。
- iPhone Safari 不支援 WebXR，所以手機路線不使用 WebXR；之後若要支援 Quest 等頭盔需另做 WebXR 模式。
