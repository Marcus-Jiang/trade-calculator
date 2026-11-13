import type { JSX } from 'react'

interface SwitchProps {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
}

export function Switch({ checked, onChange, label }: SwitchProps): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch ${checked ? 'on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="knob" />
    </button>
  )
}
