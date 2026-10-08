import { GOOGLE_CARDBOARD_PROFILE } from './lens'
import type { LensProfile, ViewerSettings } from './types'

const STORAGE_KEY = 'images2vr.settings.v1'

export const DEFAULT_SETTINGS: ViewerSettings = {
  screenWidthDeg: 60,
  ipdMm: 63,
  startDelaySec: 5,
  loop: false,
  renderScale: 1,
  profile: { ...GOOGLE_CARDBOARD_PROFILE },
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback
}

/** Coerce arbitrary stored data into valid settings, falling back to defaults per field. */
export function sanitizeSettings(raw: unknown): ViewerSettings {
  const d = DEFAULT_SETTINGS
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const p = (r.profile && typeof r.profile === 'object' ? r.profile : {}) as Record<string, unknown>
  const profile: LensProfile = {
    phoneWidthMm: num(p.phoneWidthMm, d.profile.phoneWidthMm, 80, 260),
    phoneHeightMm: num(p.phoneHeightMm, d.profile.phoneHeightMm, 40, 200),
    lensSeparationMm: num(p.lensSeparationMm, d.profile.lensSeparationMm, 40, 90),
    screenToLensMm: num(p.screenToLensMm, d.profile.screenToLensMm, 20, 80),
    trayToLensMm: num(p.trayToLensMm, d.profile.trayToLensMm, 10, 100),
    k1: num(p.k1, d.profile.k1, 0, 1.5),
    k2: num(p.k2, d.profile.k2, 0, 1.5),
  }
  return {
    screenWidthDeg: num(r.screenWidthDeg, d.screenWidthDeg, 20, 120),
    ipdMm: num(r.ipdMm, d.ipdMm, 40, 80),
    startDelaySec: Math.round(num(r.startDelaySec, d.startDelaySec, 0, 30)),
    loop: typeof r.loop === 'boolean' ? r.loop : d.loop,
    renderScale: num(r.renderScale, d.renderScale, 0.4, 1),
    profile,
  }
}

export function loadSettings(): ViewerSettings {
  try {
    const text = localStorage.getItem(STORAGE_KEY)
    return sanitizeSettings(text ? JSON.parse(text) : null)
  } catch {
    return sanitizeSettings(null)
  }
}

export function saveSettings(settings: ViewerSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // private mode / storage disabled: settings just won't persist
  }
}
