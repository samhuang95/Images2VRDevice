import {
  ColorManagement,
  DataTexture,
  LinearFilter,
  LinearSRGBColorSpace,
  Matrix3,
  Matrix4,
  Mesh,
  NoColorSpace,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  Texture,
  Vector2,
  Vector3,
  Vector4,
  VideoTexture,
  WebGLRenderer,
} from 'three'
import { eyeAspect, eyeUvRect, screenSizeMeters } from './layout'
import { eyeViewportMm, lensCenterUv } from './lens'
import type { OrientationTracker } from './orientation'
import { fragmentShader, vertexShader } from './shaders'
import type { Eye, LensProfile, SourceOptions } from './types'

// The video is already display-encoded and we only resample it, so pass pixels through untouched.
ColorManagement.enabled = false

export const SCREEN_DISTANCE_M = 3

export interface ViewerConfig extends SourceOptions {
  screenWidthDeg: number
  ipdMm: number
  renderScale: number
  profile: LensProfile
}

const EYES: Eye[] = ['left', 'right']
const EYE_TINT: Record<Eye, Vector3> = {
  left: new Vector3(0.95, 0.25, 0.25),
  right: new Vector3(0.25, 0.45, 0.95),
}

export class StereoViewer {
  private renderer: WebGLRenderer
  private scene = new Scene()
  private camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private material: ShaderMaterial
  private placeholder: Texture
  private videoTexture: VideoTexture | null = null
  private video: HTMLVideoElement | null = null
  private config: ViewerConfig | null = null
  private headRot = new Matrix3()
  private headMat = new Matrix4()
  private size = new Vector2()
  private lastDims = ''

  constructor(
    private canvas: HTMLCanvasElement,
    private tracker: OrientationTracker,
  ) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    })
    this.renderer.outputColorSpace = LinearSRGBColorSpace
    this.renderer.autoClear = false
    this.renderer.setClearColor(0x000000, 1)

    this.placeholder = new DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, RGBAFormat)
    this.placeholder.needsUpdate = true

    this.material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uVideo: { value: this.placeholder },
        uHasVideo: { value: false },
        uViewportMm: { value: new Vector2() },
        uLensCenter: { value: new Vector2() },
        uScreenToLens: { value: 39.3 },
        uK: { value: new Vector2() },
        uHeadRot: { value: this.headRot },
        uEyeOffset: { value: new Vector3() },
        uScreenSize: { value: new Vector2(1, 1) },
        uScreenDist: { value: SCREEN_DISTANCE_M },
        uUvRect: { value: new Vector4() },
        uTexel: { value: new Vector2() },
        uEyeTint: { value: new Vector3() },
      },
    })
    const quad = new Mesh(new PlaneGeometry(2, 2), this.material)
    quad.frustumCulled = false
    this.scene.add(quad)
  }

  /** Pass ``null`` to show the calibration grid instead of a video. */
  setVideo(video: HTMLVideoElement | null): void {
    this.videoTexture?.dispose()
    this.videoTexture = null
    this.video = video
    if (video) {
      const tex = new VideoTexture(video)
      tex.colorSpace = NoColorSpace
      tex.minFilter = LinearFilter
      tex.magFilter = LinearFilter
      tex.generateMipmaps = false
      this.videoTexture = tex
    }
    this.material.uniforms.uVideo!.value = this.videoTexture ?? this.placeholder
    this.material.uniforms.uHasVideo!.value = video !== null
    this.lastDims = ''
  }

  configure(config: ViewerConfig): void {
    this.config = config
    this.lastDims = ''
    this.resize()
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * (this.config?.renderScale ?? 1)
    this.renderer.setPixelRatio(dpr)
    this.renderer.setSize(
      this.canvas.clientWidth || window.innerWidth,
      this.canvas.clientHeight || window.innerHeight,
      false,
    )
  }

  start(): void {
    this.renderer.setAnimationLoop(this.render)
  }

  stop(): void {
    this.renderer.setAnimationLoop(null)
  }

  dispose(): void {
    this.stop()
    this.videoTexture?.dispose()
    this.placeholder.dispose()
    this.material.dispose()
    this.renderer.dispose()
  }

  private refreshSourceUniforms(cfg: ViewerConfig): void {
    const vw = this.video?.videoWidth ?? 0
    const vh = this.video?.videoHeight ?? 0
    const aspect = this.video ? eyeAspect(cfg.layout, vw, vh) : 16 / 9
    const screen = screenSizeMeters(cfg.screenWidthDeg, SCREEN_DISTANCE_M, aspect)
    const u = this.material.uniforms
    ;(u.uScreenSize!.value as Vector2).set(screen.width, screen.height)
    ;(u.uTexel!.value as Vector2).set(vw ? 0.5 / vw : 0, vh ? 0.5 / vh : 0)
    ;(u.uViewportMm!.value as Vector2).set(...eyeViewportMm(cfg.profile))
    u.uScreenToLens!.value = cfg.profile.screenToLensMm
    ;(u.uK!.value as Vector2).set(cfg.profile.k1, cfg.profile.k2)
  }

  private render = (): void => {
    const cfg = this.config
    if (!cfg) return

    const dims = `${this.video?.videoWidth ?? 0}x${this.video?.videoHeight ?? 0}`
    if (dims !== this.lastDims) {
      this.lastDims = dims
      this.refreshSourceUniforms(cfg)
    }

    this.tracker.update()
    this.headMat.makeRotationFromQuaternion(this.tracker.quaternion)
    this.headRot.setFromMatrix4(this.headMat)

    this.renderer.getSize(this.size)
    const halfW = this.size.x / 2
    const h = this.size.y
    const u = this.material.uniforms

    this.renderer.setScissorTest(true)
    for (const eye of EYES) {
      const x = eye === 'left' ? 0 : halfW
      this.renderer.setViewport(x, 0, halfW, h)
      this.renderer.setScissor(x, 0, halfW, h)

      ;(u.uLensCenter!.value as Vector2).set(...lensCenterUv(cfg.profile, eye))
      ;(u.uEyeOffset!.value as Vector3).set(((eye === 'left' ? -1 : 1) * cfg.ipdMm) / 2000, 0, 0)
      const r = eyeUvRect(cfg.layout, eye, cfg.swapEyes)
      ;(u.uUvRect!.value as Vector4).set(r.x, r.y, r.w, r.h)
      ;(u.uEyeTint!.value as Vector3).copy(EYE_TINT[eye])

      this.renderer.render(this.scene, this.camera)
    }
  }
}
