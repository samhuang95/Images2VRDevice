import { Quaternion, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { OrientationTracker, orientationToQuaternion, yawOf } from '../orientation'

const forward = (q: Quaternion) => new Vector3(0, 0, -1).applyQuaternion(q)
const up = (q: Quaternion) => new Vector3(0, 1, 0).applyQuaternion(q)

describe('orientationToQuaternion', () => {
  it('upright portrait phone faces -Z (north) with the camera up axis up', () => {
    const q = orientationToQuaternion(new Quaternion(), 0, 90, 0, 0)
    expect(forward(q).distanceTo(new Vector3(0, 0, -1))).toBeLessThan(1e-6)
    expect(up(q).distanceTo(new Vector3(0, 1, 0))).toBeLessThan(1e-6)
  })

  it('alpha rotates the heading counter-clockwise seen from above', () => {
    const q = orientationToQuaternion(new Quaternion(), 90, 90, 0, 0)
    expect(forward(q).distanceTo(new Vector3(-1, 0, 0))).toBeLessThan(1e-6)
  })

  it.each([
    ['landscape-primary', -90, 90],
    ['landscape-secondary', 90, 270],
  ])('%s keeps the horizon level (phone held like in a Cardboard)', (_name, gamma, angle) => {
    const q = orientationToQuaternion(new Quaternion(), 30, 0, gamma, angle)
    expect(forward(q).y).toBeCloseTo(0, 6)
    expect(up(q).distanceTo(new Vector3(0, 1, 0))).toBeLessThan(1e-6)
  })
})

describe('yawOf', () => {
  it('is zero facing -Z and positive when turned left', () => {
    expect(yawOf(new Quaternion())).toBeCloseTo(0)
    const left = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2)
    expect(yawOf(left)).toBeCloseTo(Math.PI / 2)
  })
})

describe('OrientationTracker', () => {
  function fire(alpha: number | null, beta: number | null, gamma: number | null) {
    const e = new Event('deviceorientation') as DeviceOrientationEvent
    Object.assign(e, { alpha, beta, gamma })
    window.dispatchEvent(e)
  }

  it('ignores the empty event desktop browsers fire and keeps drag mode', () => {
    const t = new OrientationTracker()
    t.attach(document.createElement('div'))
    fire(null, null, null)
    expect(t.mode).toBe('drag')
    t.detach()
  })

  it('switches to gyro mode and recentres so the first heading is straight ahead', () => {
    const t = new OrientationTracker()
    t.attach(document.createElement('div'))
    fire(120, 90, 0) // phone happens to be facing some arbitrary heading
    expect(t.mode).toBe('gyro')
    t.update()
    expect(forward(t.quaternion).distanceTo(new Vector3(0, 0, -1))).toBeLessThan(1e-6)

    fire(150, 90, 0) // turn the head 30 degrees to the left
    t.update()
    expect(yawOf(t.quaternion)).toBeCloseTo((30 * Math.PI) / 180, 5)

    t.recenter()
    t.update()
    expect(yawOf(t.quaternion)).toBeCloseTo(0, 5)
    t.detach()
  })

  it('reports granted when the platform has no permission prompt', async () => {
    expect(await new OrientationTracker().requestPermission()).toMatch(/granted|unsupported/)
  })
})
