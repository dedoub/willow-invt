export const t = {
  font: {
    sans: '"Inter Tight", "Inter", system-ui, sans-serif',
    mono: '"JetBrains Mono", ui-monospace, monospace',
  },
  weight: { regular: 420, medium: 520, semibold: 620, bold: 720 },
  neutrals: {
    page: '#FAFAFA',
    card: '#FFFFFF',
    inner: '#F6F6F7',
    line: 'rgba(15,15,20,0.07)',
    text: '#0E0F12',
    muted: '#5B5E66',
    subtle: '#9398A0',
  },
  brand: {
    50: '#ECF6FB', 100: '#D2EAF3', 200: '#A7D4E9', 300: '#75B9DB',
    400: '#4A9EC9', 500: '#2183B4', 600: '#166A97', 700: '#125577',
    800: '#0E415A', 900: '#0A2E40',
  },
  accent: { pos: '#107A52', neg: '#C23A3A', warn: '#B8781F' },
  radius: { sm: 4, md: 6, lg: 8, pill: 999 },
  density: { rowH: 34, cardPad: 14, gapSm: 6, gapMd: 10, gapLg: 16 },
  badge: { radius: 4, weight: 520, padX: 7, padY: 2, size: 11 },
} as const

export type LinearTokens = typeof t

export const tonePalettes = {
  neutral:  { bg: '#EDEDEE', fg: '#2A2A2E' },
  pending:  { bg: '#FBEFD5', fg: '#8B5A12' },
  progress: { bg: '#DCE8F5', fg: '#1F4E79' },
  done:     { bg: '#DAEEDD', fg: '#1F5F3D' },
  brand:    { bg: '#D2EAF3', fg: '#125577' },
  warn:     { bg: '#F9E8D0', fg: '#8A5A1A' },
  danger:   { bg: '#F3DADA', fg: '#8A2A2A' },
  info:     { bg: '#DCE8F5', fg: '#1F4E79' },
  pos:      { bg: '#DAEEDD', fg: '#1F5F3D' },
  neg:      { bg: '#F3DADA', fg: '#8A2A2A' },
} as const

export type ToneName = keyof typeof tonePalettes

export const eventTones = {
  brand:   { bg: '#D2EAF3', fg: '#125577' },
  info:    { bg: '#DCE8F5', fg: '#1F4E79' },
  warn:    { bg: '#F9E8D0', fg: '#8A5A1A' },
  done:    { bg: '#DAEEDD', fg: '#1F5F3D' },
  neutral: { bg: '#F6F6F7', fg: '#0E0F12' },
} as const
