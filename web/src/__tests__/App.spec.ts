import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import App from '../App.vue'

describe('App', () => {
  it('starts on the setup screen with start disabled until a video is chosen', () => {
    const wrapper = mount(App)
    expect(wrapper.text()).toContain('影片 → 紙盒 VR')
    const buttons = wrapper.findAll('button')
    const enter = buttons.find((b) => b.text() === '進入 VR')!
    const calibrate = buttons.find((b) => b.text().includes('校準模式'))!
    expect(enter.attributes('disabled')).toBeDefined()
    expect(calibrate.attributes('disabled')).toBeUndefined()
  })
})
