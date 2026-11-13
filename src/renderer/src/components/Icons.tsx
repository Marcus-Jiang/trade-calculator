import type { JSX } from 'react'
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function Svg({ children, ...props }: IconProps): JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

export function PinIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1h1V4H7v2h1a1 1 0 0 1 1 1z" />
    </Svg>
  )
}

export function SlidersIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M4 7h16" />
      <circle cx="9" cy="7" r="2" />
      <path d="M4 17h16" />
      <circle cx="15" cy="17" r="2" />
    </Svg>
  )
}

export function MinusIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M5 12h14" />
    </Svg>
  )
}

export function CloseIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  )
}

export function RefreshIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M20 11a8 8 0 1 0-2.34 5.66" />
      <path d="M20 4v7h-7" />
    </Svg>
  )
}

export function ChevronDownIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M6 9l6 6 6-6" />
    </Svg>
  )
}
