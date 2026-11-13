/** 把键盘事件转换为全局快捷键的 accelerator 字符串。 */

const MODIFIERS = new Set(['Control', 'Alt', 'Shift', 'Meta'])

const NAMED_KEYS: Record<string, string> = {
  ' ': 'Space',
  '+': 'Plus',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Home: 'Home',
  End: 'End',
  Insert: 'Insert',
  Delete: 'Delete',
  Backspace: 'Backspace',
  Enter: 'Enter',
  Tab: 'Tab'
}

function normalizeKey(key: string): string | null {
  if (key === 'Escape') return null
  if (NAMED_KEYS[key]) return NAMED_KEYS[key]
  if (/^[a-zA-Z]$/.test(key)) return key.toUpperCase()
  if (/^[0-9]$/.test(key)) return key
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(key)) return key
  if (key.length === 1) return key
  return null
}

/**
 * 按物理按键（event.code）取加速键名，避免非 US 布局下
 * “按下的键”和“注册的键”不是同一个位置（例如 JIS 的 + 在 Semicolon 上）。
 */
function keyFromCode(code: string): string | null {
  if (!code || code.startsWith('Numpad')) return null
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit[0-9]$/.test(code)) return code.slice(5)
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code
  const punctuation: Record<string, string> = {
    Backquote: '`',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: String.fromCharCode(92),
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    Space: 'Space',
    Enter: 'Enter',
    Tab: 'Tab',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Insert: 'Insert',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right'
  }
  return punctuation[code] ?? null
}

export function acceleratorFromEvent(
  event: KeyboardEvent,
  platform?: string
): string | null {
  if (MODIFIERS.has(event.key)) return null
  const modifiers: string[] = []
  if (event.ctrlKey) modifiers.push('Control')
  if (event.altKey) modifiers.push('Alt')
  if (event.shiftKey) modifiers.push('Shift')
  if (event.metaKey) modifiers.push('Super')
  // Windows 上单独 Win 键通常被系统占用；macOS 的 Command 是标准修饰键
  const hasRequiredModifier =
    event.ctrlKey ||
    event.altKey ||
    event.shiftKey ||
    (platform === 'macos' && event.metaKey)
  if (!hasRequiredModifier) return null
  const code = event.code ?? ''
  // 数字小键盘的物理键无法用主键盘的键名表示，直接忽略
  if (code.startsWith('Numpad')) return null
  const key = keyFromCode(code) ?? normalizeKey(event.key)
  if (!key) return null
  return [...modifiers, key].join('+')
}

export function displayAccelerator(accelerator: string, platform?: string): string {
  if (platform === 'macos') {
    return accelerator
      .replace(/\bControl\b/g, '⌃')
      .replace(/\bAlt\b/g, '⌥')
      .replace(/\bShift\b/g, '⇧')
      .replace(/\bSuper\b/g, '⌘')
      .replace(/\bPlus\b/g, '+')
  }
  return accelerator
    .replace(/\bControl\b/g, 'Ctrl')
    .replace(/\bSuper\b/g, 'Win')
    .replace(/\bPlus\b/g, '+')
}
