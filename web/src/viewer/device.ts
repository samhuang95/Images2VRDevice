/** Browser helpers for immersive viewing. Everything is best-effort: failures are ignored. */

interface LockableOrientation {
  lock?: (orientation: string) => Promise<void>
  unlock?: () => void
}

export async function enterImmersive(el: HTMLElement): Promise<void> {
  try {
    await el.requestFullscreen?.({ navigationUI: 'hide' })
  } catch {
    // iPhone Safari only allows fullscreen on <video>; nothing to do
  }
  try {
    await (screen.orientation as unknown as LockableOrientation | undefined)?.lock?.('landscape')
  } catch {
    // not supported outside fullscreen / on iOS: the user rotates the phone manually
  }
}

export async function exitImmersive(): Promise<void> {
  try {
    ;(screen.orientation as unknown as LockableOrientation | undefined)?.unlock?.()
    if (document.fullscreenElement) await document.exitFullscreen()
  } catch {
    // ignore
  }
}

/** Keeps the screen awake; re-acquires after the tab becomes visible again. */
export class ScreenWakeLock {
  private sentinel: WakeLockSentinel | null = null
  private active = false

  async acquire(): Promise<void> {
    this.active = true
    document.addEventListener('visibilitychange', this.onVisibility)
    await this.request()
  }

  async release(): Promise<void> {
    this.active = false
    document.removeEventListener('visibilitychange', this.onVisibility)
    try {
      await this.sentinel?.release()
    } catch {
      // ignore
    }
    this.sentinel = null
  }

  private async request(): Promise<void> {
    try {
      this.sentinel = (await navigator.wakeLock?.request('screen')) ?? null
    } catch {
      this.sentinel = null
    }
  }

  private onVisibility = (): void => {
    if (this.active && document.visibilityState === 'visible') void this.request()
  }
}
