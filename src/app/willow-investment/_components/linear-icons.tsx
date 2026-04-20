'use client'

const paths: Record<string, string> = {
  chevronDown: 'M6 9l6 6 6-6',
  chevronLeft: 'M15 6l-6 6 6 6',
  chevronRight: 'M9 6l6 6-6 6',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3',
  bell: 'M18 16v-5a6 6 0 10-12 0v5l-2 2h16l-2-2zM10 20a2 2 0 004 0',
  calendar: 'M3 8h18M7 3v4M17 3v4M4 6h16v14H4z',
  trending: 'M3 17l6-6 4 4 8-8M14 7h7v7',
  arrow: 'M5 12h14M13 5l7 7-7 7',
  filter: 'M3 5h18M6 12h12M10 19h4',
  check: 'M5 12l5 5L20 7',
  x: 'M6 6l12 12M6 18L18 6',
  leaf: 'M11 19A7 7 0 0018 5H7a7 7 0 004 14zM11 19v-8',
  building: 'M3 21h18M5 21V7l8-4v18M13 9h6v12',
  file: 'M13 3H5v18h14V9l-6-6zM13 3v6h6',
  briefcase: 'M4 7h16v13H4zM8 7V5a2 2 0 012-2h4a2 2 0 012 2v2',
  mail: 'M3 7l9 6 9-6M3 7v10h18V7H3z',
  book: 'M4 5a2 2 0 012-2h13v18H6a2 2 0 01-2-2V5zM4 5v14',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6z',
  mic: 'M12 15a3 3 0 003-3V6a3 3 0 10-6 0v6a3 3 0 003 3zM19 12a7 7 0 01-14 0M12 19v3',
  dot: 'M12 12h.01',
}

interface LIconProps {
  name: string
  size?: number
  color?: string
  stroke?: number
  className?: string
}

export function LIcon({ name, size = 16, color = 'currentColor', stroke = 1.5, className }: LIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
      className={className}>
      <path d={paths[name] || paths.dot} />
    </svg>
  )
}
