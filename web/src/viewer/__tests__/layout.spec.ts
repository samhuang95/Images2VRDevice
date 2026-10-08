import { describe, expect, it } from 'vitest'
import { eyeAspect, eyeUvRect, guessLayout, screenSizeMeters } from '../layout'

describe('eyeUvRect', () => {
  it('splits SBS frames in half, left eye first', () => {
    expect(eyeUvRect('half-sbs', 'left')).toEqual({ x: 0, y: 0, w: 0.5, h: 1 })
    expect(eyeUvRect('full-sbs', 'right')).toEqual({ x: 0.5, y: 0, w: 0.5, h: 1 })
  })

  it('swaps eyes on request', () => {
    expect(eyeUvRect('half-sbs', 'left', true).x).toBe(0.5)
    expect(eyeUvRect('half-sbs', 'right', true).x).toBe(0)
  })

  it('shows the whole frame to both eyes in mono', () => {
    expect(eyeUvRect('mono', 'left')).toEqual({ x: 0, y: 0, w: 1, h: 1 })
    expect(eyeUvRect('mono', 'right', true)).toEqual({ x: 0, y: 0, w: 1, h: 1 })
  })
})

describe('eyeAspect', () => {
  it('uses the frame aspect for half-SBS (already squeezed) and mono', () => {
    expect(eyeAspect('half-sbs', 1920, 1080)).toBeCloseTo(16 / 9)
    expect(eyeAspect('mono', 1920, 1080)).toBeCloseTo(16 / 9)
  })

  it('halves the frame width for full-SBS', () => {
    expect(eyeAspect('full-sbs', 3840, 1080)).toBeCloseTo(16 / 9)
  })

  it('falls back to 16:9 before metadata is loaded', () => {
    expect(eyeAspect('full-sbs', 0, 0)).toBeCloseTo(16 / 9)
  })
})

describe('guessLayout', () => {
  it.each([
    ['holiday_hsbs.mp4', 1920, 1080, 'half-sbs'],
    ['holiday_fsbs.mp4', 3840, 1080, 'full-sbs'],
    ['clip_half-sbs.mp4', 0, 0, 'half-sbs'],
    ['clip_SBS.mp4', 1920, 1080, 'half-sbs'],
    ['clip_SBS.mp4', 3840, 1080, 'full-sbs'],
    ['holiday.mp4', 1920, 1080, 'mono'],
    ['holiday.mp4', 3840, 1080, 'full-sbs'],
    ['unknown.mp4', 0, 0, 'mono'],
  ])('%s %ix%i -> %s', (name, w, h, expected) => {
    expect(guessLayout(name, w, h)).toBe(expected)
  })
})

describe('screenSizeMeters', () => {
  it('derives width from the angle and height from the aspect', () => {
    const s = screenSizeMeters(90, 3, 16 / 9)
    expect(s.width).toBeCloseTo(6, 5) // 2 * 3 * tan(45deg)
    expect(s.height).toBeCloseTo(6 / (16 / 9), 5)
  })
})
