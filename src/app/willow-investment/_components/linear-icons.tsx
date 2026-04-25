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
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',
  paperclip: 'M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48',
  sparkles: 'M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3zM5 19l1 3 1-3 3-1-3-1-1-3-1 3-3 1 3 1z',
  history: 'M3 12a9 9 0 1018 0 9 9 0 10-18 0M12 7v5l3 3M3 12h1',
  reply: 'M9 17l-5-5 5-5M4 12h12a4 4 0 010 8h-1',
  trash: 'M3 6h18M8 6V4h8v2M5 6v14h14V6M10 11v5M14 11v5',
  loader: 'M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83',
  user: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8',
  message: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',
  refresh: 'M1 4v6h6M23 20v-6h-6M20.49 9A9 9 0 005.64 5.64L1 10M3.51 15a9 9 0 0014.85 3.36L23 14',
  tag: 'M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82zM7 7h.01',
  forward: 'M13 9l3 3-3 3M9 9l3 3-3 3M4 12h12',
  menu: 'M3 6h18M3 12h18M3 18h18',
  bookOpen: 'M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2V3zM22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7V3z',
  clipboardList: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M12 12h4M12 16h4M8 12h.01M8 16h.01',
  circle: 'M12 12m-9 0a9 9 0 1018 0 9 9 0 10-18 0',
  checkCircle: 'M9 12l2 2 4-4M12 3a9 9 0 100 18 9 9 0 000-18z',
  clock: 'M12 6v6l4 2M12 3a9 9 0 100 18 9 9 0 000-18z',
  pin: 'M12 2l4 4-1 9-3 3-3-3-1-9 4-4z',
  pencil: 'M17 3a2.85 2.85 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z',
  logOut: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
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
