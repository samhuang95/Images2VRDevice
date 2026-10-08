import { reactive, watch } from 'vue'
import { DEFAULT_SETTINGS, loadSettings, sanitizeSettings, saveSettings } from '@/viewer/settings'
import type { ViewerSettings } from '@/viewer/types'

export const settings = reactive<ViewerSettings>(loadSettings())

watch(settings, () => saveSettings(sanitizeSettings(settings)), { deep: true })

export function resetSettings(): void {
  Object.assign(settings, structuredClone(DEFAULT_SETTINGS))
}
