import { Euler, MathUtils, Quaternion, Vector3 } from 'three'

const Y_AXIS = new Vector3(0, 1, 0)
const Z_AXIS = new Vector3(0, 0, 1)
// The camera looks out of the back of the device, not out of its top.
const CAMERA_OUT_THE_BACK = new Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2)
const tmpEuler = new Euler()
const tmpQuat = new Quaternion()
const tmpVec = new Vector3()

/** W3C DeviceOrientation angles (degrees) -> head orientation in three.js world space. */
export function orientationToQuaternion(
  out: Quaternion,
  alphaDeg: number,
  betaDeg: number,
  gammaDeg: number,
  screenAngleDeg: number,
): Quaternion {
  tmpEuler.set(
    MathUtils.degToRad(betaDeg),
    MathUtils.degToRad(alphaDeg),
    -MathUtils.degToRad(gammaDeg),
    'YXZ',
  )
  out.setFromEuler(tmpEuler)
  out.multiply(CAMERA_OUT_THE_BACK)
  out.multiply(tmpQuat.setFromAxisAngle(Z_AXIS, -MathUtils.degToRad(screenAngleDeg)))
  return out
}

/** Heading (rotation about world Y) of the direction the camera faces. */
export function yawOf(q: Quaternion): number {
  tmpVec.set(0, 0, -1).applyQuaternion(q)
  return Math.atan2(-tmpVec.x, -tmpVec.z)
}

export type PermissionResult = 'granted' | 'denied' | 'unsupported'
export type TrackingMode = 'drag' | 'gyro'

function currentScreenAngle(): number {
  const legacy = (window as unknown as { orientation?: number }).orientation
  return screen.orientation?.angle ?? legacy ?? 0
}

/**
 * Head tracking from the phone's gyroscope. On devices without orientation sensors (desktop)
 * it falls back to dragging with the pointer, which is handy for development.
 */
export class OrientationTracker {
  readonly quaternion = new Quaternion()
  mode: TrackingMode = 'drag'

  private raw = new Quaternion()
  private yawOffset = new Quaternion()
  private angles: [number, number, number] | null = null
  private dragYaw = 0
  private dragPitch = 0
  private target: HTMLElement | null = null
  private dragging: { x: number; y: number } | null = null

  async requestPermission(): Promise<PermissionResult> {
    const ctor = (window as unknown as { DeviceOrientationEvent?: unknown })
      .DeviceOrientationEvent as
      { requestPermission?: () => Promise<'granted' | 'denied'> } | undefined
    if (!ctor) return 'unsupported'
    if (typeof ctor.requestPermission !== 'function') return 'granted' // no prompt on Android/desktop
    try {
      return await ctor.requestPermission()
    } catch {
      return 'denied'
    }
  }

  attach(target: HTMLElement): void {
    this.target = target
    window.addEventListener('deviceorientation', this.onOrientation)
    target.addEventListener('pointerdown', this.onPointerDown)
    target.addEventListener('pointermove', this.onPointerMove)
    target.addEventListener('pointerup', this.onPointerUp)
    target.addEventListener('pointercancel', this.onPointerUp)
  }

  detach(): void {
    window.removeEventListener('deviceorientation', this.onOrientation)
    const t = this.target
    if (t) {
      t.removeEventListener('pointerdown', this.onPointerDown)
      t.removeEventListener('pointermove', this.onPointerMove)
      t.removeEventListener('pointerup', this.onPointerUp)
      t.removeEventListener('pointercancel', this.onPointerUp)
    }
    this.target = null
  }

  /** Make the current heading "straight ahead" (pitch is left untouched). */
  recenter(): void {
    if (this.mode === 'gyro' && this.angles) {
      this.computeRaw()
      this.yawOffset.setFromAxisAngle(Y_AXIS, -yawOf(this.raw))
    } else {
      this.dragYaw = 0
      this.dragPitch = 0
    }
  }

  /** Call once per frame before reading ``quaternion``. */
  update(): void {
    if (this.mode === 'gyro' && this.angles) {
      this.computeRaw()
      this.quaternion.copy(this.yawOffset).multiply(this.raw)
    } else {
      this.quaternion.setFromEuler(tmpEuler.set(this.dragPitch, this.dragYaw, 0, 'YXZ'))
    }
  }

  private computeRaw(): void {
    const [a, b, g] = this.angles!
    orientationToQuaternion(this.raw, a, b, g, currentScreenAngle())
  }

  private onOrientation = (e: DeviceOrientationEvent): void => {
    if (e.alpha === null || e.beta === null || e.gamma === null) return // desktop fires an empty event
    this.angles = [e.alpha, e.beta, e.gamma]
    if (this.mode !== 'gyro') {
      this.mode = 'gyro'
      this.recenter()
    }
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (this.mode === 'gyro') return
    this.dragging = { x: e.clientX, y: e.clientY }
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.dragging || this.mode === 'gyro') return
    const dx = e.clientX - this.dragging.x
    const dy = e.clientY - this.dragging.y
    this.dragging = { x: e.clientX, y: e.clientY }
    const limit = MathUtils.degToRad(85)
    this.dragYaw -= dx * 0.005
    this.dragPitch = MathUtils.clamp(this.dragPitch - dy * 0.005, -limit, limit)
  }

  private onPointerUp = (): void => {
    this.dragging = null
  }
}
