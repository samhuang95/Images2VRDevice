import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, loadSettings, sanitizeSettings, saveSettings } from '../settings'

beforeEach(() => localStorage.clear())

describe('sanitizeSettings', () => {
  it('returns defaults for garbage input', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(sanitizeSettings('nope')).toEqual(DEFAULT_SETTINGS)
    expect(sanitizeSettings({ ipdMm: 'wide', profile: 5 })).toEqual(DEFAULT_SETTINGS)
  })

  it('clamps out-of-range numbers and keeps valid ones', () => {
    const s = sanitizeSettings({ ipdMm: 500, screenWidthDeg: 75, profile: { k1: -2, k2: 0.7 } })
    expect(s.ipdMm).toBe(80)
    expect(s.screenWidthDeg).toBe(75)
    expect(s.profile.k1).toBe(0)
    expect(s.profile.k2).toBe(0.7)
  })

  it('never returns NaN', () => {
    expect(sanitizeSettings({ ipdMm: NaN }).ipdMm).toBe(DEFAULT_SETTINGS.ipdMm)
  })
})

describe('persistence', () => {
  it('round-trips through localStorage', () => {
    const custom = sanitizeSettings({ ipdMm: 61.5, loop: true })
    saveSettings(custom)
    expect(loadSettings()).toEqual(custom)
  })

  it('survives corrupt storage', () => {
    localStorage.setItem('images2vr.settings.v1', '{not json')
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
  })
})
