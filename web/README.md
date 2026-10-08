# web — Cardboard VR 影片播放器

Vue 3 + Vite + TypeScript + three.js。選一個左右並排（SBS）影片，手機橫放進 Cardboard 紙盒觀看。

```bash
npm install
npm run dev          # https://<區網 IP>:5173（自簽憑證；iPhone 的陀螺儀需要 HTTPS）
npm run test:unit    # vitest
npm run type-check
npm run lint
npm run build        # 輸出 dist/，可放任何靜態空間（資源路徑為相對路徑）
```

## 結構

| 路徑 | 職責 |
|---|---|
| `src/App.vue` | 設定畫面 ⇄ 觀看畫面切換；在使用者點擊當下啟動陀螺儀授權、全螢幕、影片解鎖 |
| `src/components/SetupPanel.vue` | 選檔、格式、觀看與紙盒參數 |
| `src/components/ViewerStage.vue` | 全螢幕畫布、倒數、點擊播放／暫停、長按離開、螢幕不休眠 |
| `src/viewer/StereoViewer.ts` | three.js 畫布，每眼一個 viewport |
| `src/viewer/shaders.ts` | 核心 shader：畸變反推 → 頭部姿態 → 與虛擬螢幕求交 → 取樣影片 |
| `src/viewer/lens.ts` | 紙盒鏡片幾何與畸變（與 shader 對應的純函式，有單元測試） |
| `src/viewer/layout.ts` | SBS 取樣區域、螢幕比例、從檔名猜格式（`_hsbs` / `_fsbs`） |
| `src/viewer/orientation.ts` | DeviceOrientation → 頭部姿態、歸零、iOS 權限；桌機以拖曳代替 |
| `src/viewer/settings.ts` | 設定預設值、驗證、localStorage 存取 |

## 開發小技巧

- 桌機瀏覽器沒有陀螺儀：進入後用滑鼠拖曳轉頭、空白鍵播放／暫停、Esc 離開。
- 「校準模式」不需要影片：左眼右上角標記為紅色、右眼為藍色，格線在鏡片後應該是直的。
- 影片以 H.264 MP4 最保險；格式由 `converter` 輸出。
