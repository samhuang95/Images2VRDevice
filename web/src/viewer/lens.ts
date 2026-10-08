import type { Eye, LensProfile } from './types'

/** Defaults taken from Google's published profile for Cardboard-inspired viewers. */
export const GOOGLE_CARDBOARD_PROFILE: LensProfile = {
  phoneWidthMm: 150,
  phoneHeightMm: 70,
  lensSeparationMm: 63.9,
  screenToLensMm: 39.3,
  trayToLensMm: 35,
  k1: 0.336,
  k2: 0.553,
}

export type Vec2 = readonly [number, number]

/** Physical size of one eye's half of the screen, in mm. */
export function eyeViewportMm(p: LensProfile): Vec2 {
  return [p.phoneWidthMm / 2, p.phoneHeightMm]
}

/**
 * Lens centre inside one eye's viewport, in 0..1 uv with the origin at the bottom-left.
 * The lenses sit closer together than the middles of the two half-screens, so each centre
 * is shifted towards the middle of the phone.
 */
export function lensCenterUv(p: LensProfile, eye: Eye): Vec2 {
  const x =
    eye === 'left' ? 1 - p.lensSeparationMm / p.phoneWidthMm : p.lensSeparationMm / p.phoneWidthMm
  return [x, p.trayToLensMm / p.phoneHeightMm]
}

/** Lens centre as a fraction of the whole screen (origin bottom-left), e.g. to place HUD text. */
export function lensCenterOnScreen(p: LensProfile, eye: Eye): Vec2 {
  const [x, y] = lensCenterUv(p, eye)
  return [(eye === 'left' ? x : 1 + x) / 2, y]
}

/** Radial scale applied by the lens-compensation pre-warp at tan-angle radius ``r``. */
export function distortionFactor(p: Pick<LensProfile, 'k1' | 'k2'>, r: number): number {
  const r2 = r * r
  return 1 + p.k1 * r2 + p.k2 * r2 * r2
}

/**
 * Direction (as tan-angles on the x/y axes) that a screen point is seen at through the lens.
 * ``u``/``v`` are 0..1 within the eye viewport. Mirrors the fragment shader.
 */
export function viewTanAngle(p: LensProfile, eye: Eye, u: number, v: number): Vec2 {
  const [cx, cy] = lensCenterUv(p, eye)
  const [wMm, hMm] = eyeViewportMm(p)
  const sx = ((u - cx) * wMm) / p.screenToLensMm
  const sy = ((v - cy) * hMm) / p.screenToLensMm
  const f = distortionFactor(p, Math.hypot(sx, sy))
  return [sx * f, sy * f]
}
