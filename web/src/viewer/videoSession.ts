/** A hidden <video> element playing a local file, plus the bookkeeping to release it. */
export class VideoSession {
  readonly video: HTMLVideoElement
  private readonly url: string
  private unlocked: Promise<void> = Promise.resolve()

  constructor(file: File, loop: boolean) {
    this.url = URL.createObjectURL(file)
    const v = document.createElement('video')
    v.src = this.url
    v.loop = loop
    v.playsInline = true
    v.preload = 'auto'
    v.setAttribute('webkit-playsinline', '')
    // must stay in the DOM and "visible" or some mobile browsers stop decoding frames
    Object.assign(v.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      width: '1px',
      height: '1px',
      opacity: '0.01',
      pointerEvents: 'none',
    })
    document.body.appendChild(v)
    this.video = v
  }

  /**
   * Mobile browsers only let a media element start playing from a user gesture. Call this from
   * the tap handler: it plays and immediately pauses so later programmatic play() calls work.
   */
  unlock(): void {
    const v = this.video
    this.unlocked = v
      .play()
      .then(() => {
        v.pause()
        v.currentTime = 0
      })
      .catch(() => undefined)
  }

  async play(): Promise<boolean> {
    await this.unlocked
    try {
      await this.video.play()
      return true
    } catch {
      return false // blocked by autoplay policy: the user taps the screen to start
    }
  }

  dispose(): void {
    this.video.pause()
    this.video.removeAttribute('src')
    this.video.load()
    this.video.remove()
    URL.revokeObjectURL(this.url)
  }
}

export interface VideoInfo {
  width: number
  height: number
  duration: number
}

/** Read a file's frame size and duration without keeping a player around. */
export function probeVideo(file: File, timeoutMs = 8000): Promise<VideoInfo | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.muted = true
    const done = (info: VideoInfo | null) => {
      clearTimeout(timer)
      v.removeAttribute('src')
      v.load()
      URL.revokeObjectURL(url)
      resolve(info)
    }
    const timer = setTimeout(() => done(null), timeoutMs)
    v.onloadedmetadata = () =>
      done({ width: v.videoWidth, height: v.videoHeight, duration: v.duration })
    v.onerror = () => done(null)
    v.src = url
  })
}
