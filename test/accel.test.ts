import { describe, expect, it } from 'vitest'
import { acceleratorFromEvent, displayAccelerator } from '../src/renderer/src/lib/accel'

type KeyEventInit = Partial<
  Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>
>

function keyEvent(init: KeyEventInit): KeyboardEvent {
  return {
    key: '',
    code: '',
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...init
  } as KeyboardEvent
}

describe('acceleratorFromEvent', () => {
  it('没有 event.code 时把加号回退为 Plus，避免生成 Control++', () => {
    expect(acceleratorFromEvent(keyEvent({ key: '+', ctrlKey: true }))).toBe('Control+Plus')
    expect(
      acceleratorFromEvent(keyEvent({ key: '+', ctrlKey: true, shiftKey: true }))
    ).toBe('Control+Shift+Plus')
  })

  it('支持字母、数字、功能键与命名键', () => {
    expect(
      acceleratorFromEvent(keyEvent({ key: 'j', ctrlKey: true, shiftKey: true }))
    ).toBe('Control+Shift+J')
    expect(acceleratorFromEvent(keyEvent({ key: '1', altKey: true }))).toBe('Alt+1')
    expect(acceleratorFromEvent(keyEvent({ key: 'F5', ctrlKey: true }))).toBe('Control+F5')
    expect(acceleratorFromEvent(keyEvent({ key: 'ArrowUp', altKey: true }))).toBe('Alt+Up')
    expect(acceleratorFromEvent(keyEvent({ key: ' ', altKey: true }))).toBe('Alt+Space')
  })

  it('拒绝无标准修饰键、仅 Meta、纯修饰键和 Escape', () => {
    expect(acceleratorFromEvent(keyEvent({ key: 'a' }))).toBeNull()
    expect(acceleratorFromEvent(keyEvent({ key: 'j', metaKey: true }))).toBeNull()
    expect(acceleratorFromEvent(keyEvent({ key: 'Control', ctrlKey: true }))).toBeNull()
    expect(acceleratorFromEvent(keyEvent({ key: 'Escape', ctrlKey: true }))).toBeNull()
  })

  it('按物理键记录符号键，避免非 US 布局错位', () => {
    expect(
      acceleratorFromEvent(keyEvent({ key: '+', code: 'Semicolon', ctrlKey: true, shiftKey: true }))
    ).toBe('Control+Shift+;')
    expect(acceleratorFromEvent(keyEvent({ key: '+', code: 'Equal', ctrlKey: true }))).toBe(
      'Control+='
    )
    expect(acceleratorFromEvent(keyEvent({ key: 'a', code: 'KeyQ', ctrlKey: true }))).toBe(
      'Control+Q'
    )
    expect(acceleratorFromEvent(keyEvent({ key: '1', code: 'Digit1', altKey: true }))).toBe('Alt+1')
    expect(
      acceleratorFromEvent(keyEvent({ key: '+', code: 'NumpadAdd', ctrlKey: true }))
    ).toBeNull()
  })

  it('展示时把 Control/Super 替换为常见写法', () => {
    expect(displayAccelerator('Control+Shift+J')).toBe('Ctrl+Shift+J')
    expect(displayAccelerator('Super+J')).toBe('Win+J')
  })

  it('macOS 允许 Command 并显示为系统符号', () => {
    expect(acceleratorFromEvent(keyEvent({ key: 'j', metaKey: true }), 'macos')).toBe(
      'Super+J'
    )
    expect(acceleratorFromEvent(keyEvent({ key: 'j', metaKey: true }))).toBeNull()
    expect(displayAccelerator('Control+Alt+Shift+Super+J', 'macos')).toBe('⌃+⌥+⇧+⌘+J')
  })
})
