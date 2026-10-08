<script setup lang="ts">
import { ref, shallowRef } from 'vue'
import SetupPanel from '@/components/SetupPanel.vue'
import ViewerStage from '@/components/ViewerStage.vue'
import { settings } from '@/stores/settings'
import { enterImmersive, exitImmersive } from '@/viewer/device'
import { OrientationTracker } from '@/viewer/orientation'
import type { SourceOptions } from '@/viewer/types'
import { VideoSession } from '@/viewer/videoSession'

const tracker = new OrientationTracker()
const viewing = ref(false)
const permissionDenied = ref(false)
const session = shallowRef<VideoSession | null>(null)
const source = ref<SourceOptions>({ layout: 'mono', swapEyes: false })

async function onStart(file: File | null): Promise<void> {
  // Sensor permission, fullscreen and media unlock all need the user gesture, so start them
  // synchronously before the first await.
  const permission = tracker.requestPermission()
  void enterImmersive(document.documentElement)
  if (file) {
    const s = new VideoSession(file, settings.loop)
    s.unlock()
    session.value = s
  } else {
    session.value = null
  }
  viewing.value = true
  permissionDenied.value = (await permission) === 'denied'
}

function onExit(): void {
  session.value?.dispose()
  session.value = null
  viewing.value = false
  void exitImmersive()
}
</script>

<template>
  <ViewerStage
    v-if="viewing"
    :tracker="tracker"
    :session="session"
    :source="source"
    :settings="settings"
    @exit="onExit"
  />
  <SetupPanel
    v-else
    v-model:source="source"
    :permission-denied="permissionDenied"
    @start="onStart"
  />
</template>
