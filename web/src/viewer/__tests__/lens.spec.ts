import { describe, expect, it } from 'vitest'
import {
  distortionFactor,
  eyeViewportMm,
  GOOGLE_CARDBOARD_PROFILE as P,
  lensCenterOnScreen,
  lensCenterUv,
  viewTanAngle,
} from '../lens'

describe('lens geometry', () => {
  it('places lens centres symmetrically, closer to the phone middle than the viewport middles', () => {
    const [lx, ly] = lensCenterUv(P, 'left')
    const [rx, ry] = lensCenterUv(P, 'right')
    expect(lx + rx).toBeCloseTo(1, 10)
    expect(lx).toBeCloseTo(1 - 63.9 / 150, 10)
    expect(lx).toBeGreaterThan(0.5)
    expect(ly).toBeCloseTo(0.5, 10)
    expect(ry).toBe(ly)
  })

  it('puts the lens centres 63.9 mm apart on the full screen', () => {
    const [l] = lensCenterOnScreen(P, 'left')
    const [r] = lensCenterOnScreen(P, 'right')
    expect((r - l) * P.phoneWidthMm).toBeCloseTo(P.lensSeparationMm, 6)
  })

  it('gives one eye half the phone width', () => {
    expect(eyeViewportMm(P)).toEqual([75, 70])
  })
})

describe('distortion', () => {
  it('is the identity at the lens centre and grows with radius', () => {
    expect(distortionFactor(P, 0)).toBe(1)
    expect(distortionFactor(P, 0.5)).toBeGreaterThan(1)
    expect(distortionFactor(P, 1)).toBeGreaterThan(distortionFactor(P, 0.5))
  })

  it('looks straight ahead through the lens centre', () => {
    const [cx, cy] = lensCenterUv(P, 'left')
    const [tx, ty] = viewTanAngle(P, 'left', cx, cy)
    expect(tx).toBeCloseTo(0, 10)
    expect(ty).toBeCloseTo(0, 10)
  })

  it('is mirror-symmetric between the eyes', () => {
    const [lx, ly] = viewTanAngle(P, 'left', 0.2, 0.8)
    const [rx, ry] = viewTanAngle(P, 'right', 1 - 0.2, 0.8)
    expect(rx).toBeCloseTo(-lx, 10)
    expect(ry).toBeCloseTo(ly, 10)
  })

  it('compensates by pushing off-centre points outwards (barrel pre-warp)', () => {
    const [cx, cy] = lensCenterUv(P, 'left')
    const du = 0.3
    const [tan] = viewTanAngle(P, 'left', cx + du, cy)
    const linear = (du * 75) / P.screenToLensMm
    expect(tan).toBeGreaterThan(linear)
  })
})
