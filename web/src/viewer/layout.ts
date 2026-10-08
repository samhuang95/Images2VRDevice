import type { Eye, VideoLayout } from './types'

export interface UvRect {
  x: number
  y: number
  w: number
  h: number
}

/** Region of the video frame that one eye should sample. */
export function eyeUvRect(layout: VideoLayout, eye: Eye, swapEyes = false): UvRect {
  if (layout === 'mono') return { x: 0, y: 0, w: 1, h: 1 }
  const leftHalf = (eye === 'left') !== swapEyes
  return { x: leftHalf ? 0 : 0.5, y: 0, w: 0.5, h: 1 }
}

/** Display aspect ratio (width / height) of a single eye's picture. */
export function eyeAspect(layout: VideoLayout, videoWidth: number, videoHeight: number): number {
  if (videoWidth <= 0 || videoHeight <= 0) return 16 / 9
  // half-SBS is squeezed horizontally by the converter, so the frame already has the eye's aspect
  return layout === 'full-sbs' ? videoWidth / 2 / videoHeight : videoWidth / videoHeight
}

/** Guess the packing from the file name (the converter writes *_hsbs / *_fsbs) and frame size. */
export function guessLayout(fileName: string, videoWidth = 0, videoHeight = 0): VideoLayout {
  if (/hsbs|half[-_ ]?sbs|sbs[-_ ]?half/i.test(fileName)) return 'half-sbs'
  if (/fsbs|full[-_ ]?sbs|sbs[-_ ]?full/i.test(fileName)) return 'full-sbs'
  const wideFrame = videoHeight > 0 && videoWidth / videoHeight >= 3.2
  if (/(^|[^a-z0-9])sbs([^a-z0-9]|$)/i.test(fileName)) return wideFrame ? 'full-sbs' : 'half-sbs'
  return wideFrame ? 'full-sbs' : 'mono'
}

export function screenSizeMeters(
  widthDeg: number,
  distanceM: number,
  aspect: number,
): { width: number; height: number } {
  const width = 2 * distanceM * Math.tan((widthDeg * Math.PI) / 360)
  return { width, height: width / aspect }
}
