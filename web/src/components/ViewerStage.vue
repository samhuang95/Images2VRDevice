<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ScreenWakeLock } from '@/viewer/device'
import { lensCenterOnScreen } from '@/viewer/lens'
import type { OrientationTracker } from '@/viewer/orientation'
import { StereoViewer } from '@/viewer/StereoViewer'
import type { SourceOptions, ViewerSettings } from '@/viewer/types'
import type { VideoSession } from '@/viewer/videoSession'

const props = defineProps<{
  tracker: OrientationTracker
  /** null shows the calibration grid instead of a video */
  session: VideoSession | null
  source: SourceOptions
  settings: ViewerSettings
}>()
const emit = defineEmits<{ exit: [] }>()

const LONG_PRESS_MS = 900
const MOVE_TOLERANCE_PX = 12

const stage = ref<HTMLDivElement>()
const canvas = ref<HTMLCanvasElement>()
const remaining = ref(props.session ? props.settings.startDelaySec : 0)
const paused = ref(true)

let viewer: StereoViewer | null = null
let countdownTimer: ReturnType<typeof setInterval> | undefined
let pressTimer: ReturnType<typeof setTimeout> | undefined
let press: { x: number; y: number; moved: boolean; longPressed: boolean } | null = null
const wakeLock = new ScreenWakeLock()

const hudStyle = (eye: 'left' | 'right') => {
  const [x, y] = lensCenterOnScreen(props.settings.profile, eye)
  return { left: `${x * 100}%`, bottom: `${y * 100}%` }
}
const hudStyles = computed(() => [hudStyle('left'), hudStyle('right')])

const hudText = computed(() => {
  if (!props.session) return ''
  if (remaining.value > 0) return String(remaining.value)
  return paused.value ? '▶' : ''
})
const hudHint = computed(() => {
  if (!props.session) return ''
  if (remaining.value > 0) return '請將手機放入紙盒'
  return paused.value ? '點一下播放' : ''
})

function applyConfig(): void {
  const s = props.settings
  viewer?.configure({
    layout: props.source.layout,
    swapEyes: props.source.swapEyes,
    screenWidthDeg: s.screenWidthDeg,
    ipdMm: s.ipdMm,
    renderScale: s.renderScale,
    profile: { ...s.profile },
  })
}

function syncPaused(): void {
  paused.value = props.session ? props.session.video.paused : false
}

async function begin(): Promise<void> {
  props.tracker.recenter()
  const session = props.session
  if (!session) return
  session.video.currentTime = 0
  await session.play()
  syncPaused()
}

function cancelCountdown(): void {
  clearInterval(countdownTimer)
  countdownTimer = undefined
  remaining.value = 0
}

function startCountdown(): void {
  if (remaining.value <= 0) {
    void begin()
    return
  }
  countdownTimer = setInterval(() => {
    remaining.value -= 1
    if (remaining.value <= 0) {
      cancelCountdown()
      void begin()
    }
  }, 1000)
}

async function togglePlay(): Promise<void> {
  const session = props.session
  if (!session) {
    props.tracker.recenter() // in calibration mode a tap re-centres the view
    return
  }
  if (remaining.value > 0) {
    cancelCountdown()
    await begin()
  } else if (session.video.paused) {
    await session.play()
  } else {
    session.video.pause()
  }
  syncPaused()
}

function onPointerDown(e: PointerEvent): void {
  press = { x: e.clientX, y: e.clientY, moved: false, longPressed: false }
  pressTimer = setTimeout(() => {
    if (press && !press.moved) {
      press.longPressed = true
      emit('exit')
    }
  }, LONG_PRESS_MS)
}

function onPointerMove(e: PointerEvent): void {
  if (!press) return
  if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > MOVE_TOLERANCE_PX) {
    press.moved = true
    clearTimeout(pressTimer)
  }
}

function onPointerUp(): void {
  clearTimeout(pressTimer)
  const p = press
  press = null
  if (p && !p.moved && !p.longPressed) void togglePlay()
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('exit')
  else if (e.key === ' ') {
    e.preventDefault()
    void togglePlay()
  }
}

const onResize = (): void => viewer?.resize()

onMounted(() => {
  viewer = new StereoViewer(canvas.value!, props.tracker)
  viewer.setVideo(props.session?.video ?? null)
  applyConfig()
  viewer.start()

  props.tracker.attach(stage.value!)
  window.addEventListener('resize', onResize)
  window.addEventListener('keydown', onKeyDown)
  void wakeLock.acquire()

  const video = props.session?.video
  if (video) {
    for (const ev of ['play', 'pause', 'ended']) video.addEventListener(ev, syncPaused)
    startCountdown()
  } else {
    props.tracker.recenter()
  }
})

onBeforeUnmount(() => {
  cancelCountdown()
  clearTimeout(pressTimer)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('keydown', onKeyDown)
  props.tracker.detach()
  void wakeLock.release()
  const video = props.session?.video
  if (video) for (const ev of ['play', 'pause', 'ended']) video.removeEventListener(ev, syncPaused)
  viewer?.dispose()
  viewer = null
})

watch(() => [props.source, props.settings], applyConfig, { deep: true })
</script>

<template>
  <div
    ref="stage"
    class="stage"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <canvas ref="canvas" class="stage__canvas" />
    <div v-for="(style, i) in hudStyles" :key="i" class="stage__hud" :style="style">
      <div class="stage__hud-main">{{ hudText }}</div>
      <div class="stage__hud-hint">{{ hudHint }}</div>
    </div>
  </div>
</template>

<style scoped>
.stage {
  position: fixed;
  inset: 0;
  background: #000;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  overflow: hidden;
}
.stage__canvas {
  display: block;
  width: 100%;
  height: 100%;
}
.stage__hud {
  position: absolute;
  transform: translate(-50%, 50%);
  text-align: center;
  color: #fff;
  pointer-events: none;
  text-shadow: 0 0 6px #000;
}
.stage__hud-main {
  font-size: 56px;
  line-height: 1;
}
.stage__hud-hint {
  font-size: 16px;
  margin-top: 6px;
}
</style>
