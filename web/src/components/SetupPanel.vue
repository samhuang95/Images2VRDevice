<script setup lang="ts">
import { computed, ref } from 'vue'
import { resetSettings, settings } from '@/stores/settings'
import { guessLayout } from '@/viewer/layout'
import type { SourceOptions, VideoLayout } from '@/viewer/types'
import { probeVideo } from '@/viewer/videoSession'

defineProps<{ permissionDenied: boolean }>()
const source = defineModel<SourceOptions>('source', { required: true })
const emit = defineEmits<{ start: [file: File | null] }>()

const file = ref<File | null>(null)
const info = ref('')

const layouts: { value: VideoLayout; label: string }[] = [
  { value: 'half-sbs', label: '左右並排（半寬，converter 預設）' },
  { value: 'full-sbs', label: '左右並排（全寬）' },
  { value: 'mono', label: '一般 2D（兩眼看同一畫面）' },
]

const canStart = computed(() => file.value !== null)

const layout = computed({
  get: () => source.value.layout,
  set: (value: VideoLayout) => (source.value = { ...source.value, layout: value }),
})
const swapEyes = computed({
  get: () => source.value.swapEyes,
  set: (value: boolean) => (source.value = { ...source.value, swapEyes: value }),
})

async function onFileChange(e: Event): Promise<void> {
  const picked = (e.target as HTMLInputElement).files?.[0] ?? null
  file.value = picked
  info.value = ''
  if (!picked) return
  const meta = await probeVideo(picked)
  layout.value = guessLayout(picked.name, meta?.width, meta?.height)
  info.value = meta
    ? `${meta.width}×${meta.height}，${Math.round(meta.duration)} 秒`
    : '無法讀取影片資訊（瀏覽器可能不支援此編碼，建議使用 H.264 MP4）'
}
</script>

<template>
  <main class="setup">
    <h1>影片 → 紙盒 VR</h1>
    <p class="muted">
      選擇已轉成左右並排（SBS）的影片，放進 Cardboard 類紙盒觀看。一般 2D 影片請先用
      <code>video2sbs</code> 轉換。
    </p>

    <p v-if="permissionDenied" class="warn">
      動作感應器權限被拒絕，無法追蹤頭部轉動。iPhone 請到「設定 › Safari ›
      動作與方向取用權限」開啟後重新整理頁面。
    </p>

    <section>
      <h2>1. 影片</h2>
      <input type="file" accept="video/*" @change="onFileChange" />
      <p v-if="info" class="muted">{{ info }}</p>

      <label class="field">
        <span>畫面格式</span>
        <select v-model="layout">
          <option v-for="l in layouts" :key="l.value" :value="l.value">{{ l.label }}</option>
        </select>
      </label>
      <label class="check">
        <input v-model="swapEyes" type="checkbox" />
        左右眼對調（看起來凹凸顛倒時勾選）
      </label>
    </section>

    <section>
      <h2>2. 觀看</h2>
      <label class="field">
        <span>虛擬螢幕寬度 {{ settings.screenWidthDeg }}°</span>
        <input v-model.number="settings.screenWidthDeg" type="range" min="30" max="100" step="5" />
      </label>
      <label class="field">
        <span>瞳距 {{ settings.ipdMm }} mm</span>
        <input v-model.number="settings.ipdMm" type="range" min="50" max="75" step="0.5" />
      </label>
      <label class="field">
        <span>開始前倒數 {{ settings.startDelaySec }} 秒（讓你把手機放進紙盒）</span>
        <input v-model.number="settings.startDelaySec" type="range" min="0" max="15" step="1" />
      </label>
      <label class="check"><input v-model="settings.loop" type="checkbox" />循環播放</label>
    </section>

    <details>
      <summary>3. 手機與紙盒參數（進階）</summary>
      <p class="muted">
        預設為 Google Cardboard
        規格。進入「校準模式」，調整到格線看起來是直的、兩眼畫面能合成一個為止。
      </p>
      <div class="grid">
        <label
          >手機螢幕寬 (mm)<input
            v-model.number="settings.profile.phoneWidthMm"
            type="number"
            step="1"
        /></label>
        <label
          >手機螢幕高 (mm)<input
            v-model.number="settings.profile.phoneHeightMm"
            type="number"
            step="1"
        /></label>
        <label
          >鏡片間距 (mm)<input
            v-model.number="settings.profile.lensSeparationMm"
            type="number"
            step="0.1"
        /></label>
        <label
          >螢幕到鏡片 (mm)<input
            v-model.number="settings.profile.screenToLensMm"
            type="number"
            step="0.1"
        /></label>
        <label
          >托盤到鏡片中心 (mm)<input
            v-model.number="settings.profile.trayToLensMm"
            type="number"
            step="0.5"
        /></label>
        <label
          >畸變 k1<input v-model.number="settings.profile.k1" type="number" step="0.01" min="0"
        /></label>
        <label
          >畸變 k2<input v-model.number="settings.profile.k2" type="number" step="0.01" min="0"
        /></label>
        <label>
          解析度比例 {{ Math.round(settings.renderScale * 100) }}%
          <input v-model.number="settings.renderScale" type="range" min="0.5" max="1" step="0.05" />
        </label>
      </div>
      <button type="button" class="link" @click="resetSettings">恢復預設</button>
    </details>

    <div class="actions">
      <button type="button" class="primary" :disabled="!canStart" @click="emit('start', file)">
        進入 VR
      </button>
      <button type="button" @click="emit('start', null)">校準模式（不需影片）</button>
    </div>

    <p class="muted tips">
      操作：點一下＝播放／暫停　長按約 1 秒＝離開　（Cardboard 的按鈕就是點螢幕）<br />
      iPhone 需用 HTTPS 開啟頁面才能使用陀螺儀；請先將手機橫放並關閉方向鎖定。
    </p>
  </main>
</template>

<style scoped>
.setup {
  max-width: 560px;
  margin: 0 auto;
  padding: 24px 16px 48px;
}
h1 {
  font-size: 24px;
  margin: 0 0 8px;
}
h2 {
  font-size: 16px;
  margin: 24px 0 8px;
}
section,
details {
  border-top: 1px solid var(--border);
}
details {
  margin-top: 24px;
  padding-top: 16px;
}
summary {
  cursor: pointer;
  font-weight: 600;
}
.field,
.check {
  display: block;
  margin: 12px 0;
}
.field span {
  display: block;
  margin-bottom: 4px;
}
.field input[type='range'],
.field select {
  width: 100%;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.grid label {
  display: block;
  font-size: 14px;
}
.grid input {
  display: block;
  width: 100%;
  margin-top: 4px;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 28px;
}
.actions button {
  flex: 1 1 180px;
  min-height: 48px;
}
.muted {
  color: var(--muted);
  font-size: 14px;
}
.tips {
  margin-top: 24px;
}
.warn {
  background: #4a2b00;
  border: 1px solid #b86e00;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 14px;
}
.link {
  background: none;
  border: none;
  color: var(--accent);
  padding: 8px 0;
  min-height: 0;
  text-decoration: underline;
}
</style>
