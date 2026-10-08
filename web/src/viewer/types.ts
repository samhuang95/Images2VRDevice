export type Eye = 'left' | 'right'

/** How the eyes are packed into the video frame. */
export type VideoLayout = 'half-sbs' | 'full-sbs' | 'mono'

/** Physical description of the phone + Cardboard-style viewer (Google "viewer profile" fields). */
export interface LensProfile {
  phoneWidthMm: number
  phoneHeightMm: number
  lensSeparationMm: number
  screenToLensMm: number
  trayToLensMm: number
  /** Radial distortion coefficients of the lens: r' = r * (1 + k1 r^2 + k2 r^4). */
  k1: number
  k2: number
}

/** User preferences that persist between sessions. */
export interface ViewerSettings {
  /** Horizontal angular size of the virtual cinema screen, in degrees. */
  screenWidthDeg: number
  ipdMm: number
  startDelaySec: number
  loop: boolean
  /** Multiplier on the device pixel ratio (0.5 - 1). */
  renderScale: number
  profile: LensProfile
}

/** Per-video options (not persisted). */
export interface SourceOptions {
  layout: VideoLayout
  swapEyes: boolean
}
