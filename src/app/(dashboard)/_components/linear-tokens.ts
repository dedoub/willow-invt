import { useState, useEffect } from 'react'

export function useIsMobile(breakpoint = 768) {
  // CSR 첫 렌더에서도 즉시 정확한 값을 반영해야 wiki/calendar 등 mobile 분기 패널이 깜빡이지 않는다.
  const [mobile, setMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth < breakpoint
  })
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < breakpoint)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [breakpoint])
  return mobile
}

export const t = {
  font: {
    // 맨 앞 "Twemoji Country Flags": Windows처럼 국기 이모지 미지원 브라우저에서만 주입되는 폰트(폴리필).
    //   국기 글리프만 담고 있어 일반 라틴/한글은 다음 폰트로 폴백 → 국기만 이 폰트로 렌더됨.
    // 한글/Windows 폴백 포함 — mono엔 한글 글리프가 없어 Windows에서 깨지므로 Apple SD Gothic Neo(맥)/Malgun Gothic(윈)을 명시
    sans: '"Twemoji Country Flags", "Inter Tight", "Inter", system-ui, "Segoe UI", Roboto, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
    mono: '"Twemoji Country Flags", "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, "Apple SD Gothic Neo", "Malgun Gothic", monospace',
  },
  weight: { regular: 420, medium: 520, semibold: 620, bold: 720 },
  neutrals: {
    page: '#F3F4F6',
    card: '#FFFFFF',
    inner: '#F7F8FA',
    line: 'rgba(15,15,20,0.09)',
    text: '#0E0F12',
    muted: '#5B5E66',
    subtle: '#9398A0',
  },
  brand: {
    50: '#ECF6FB', 100: '#D2EAF3', 200: '#A7D4E9', 300: '#75B9DB',
    400: '#4A9EC9', 500: '#2183B4', 600: '#166A97', 700: '#125577',
    800: '#0E415A', 900: '#0A2E40',
  },
  // 좌측 사이드바 — 브랜드 네이비 단색 면.
  // 로고 블록만 진하면 좌상단에 색 덩어리 하나만 튀어서, 패널 전체를 한 면으로 깔고
  // 그 위 요소는 흰색 투명도만으로 위계를 만든다(선/그림자 대신 색으로 구분).
  sidebar: {
    bg: '#0A2E40',
    line: 'rgba(255,255,255,0.10)',
    text: '#FFFFFF',
    muted: 'rgba(255,255,255,0.72)',
    subtle: 'rgba(255,255,255,0.44)',
    hover: 'rgba(255,255,255,0.07)',
    active: 'rgba(255,255,255,0.12)',
    accent: '#75B9DB',
  },
  accent: { pos: '#107A52', neg: '#C23A3A', warn: '#B8781F' },
  radius: { sm: 4, md: 6, lg: 8, pill: 999 },
  density: {
    rowH: 34,
    headerH: 48,
    controlH: 28,
    controlHSm: 28,
    controlHMd: 34,
    controlHLg: 40,
    controlPadXSm: 10,
    controlPadXMd: 14,
    controlPadXLg: 18,
    segmentedMinWSm: 34,
    segmentedMinWMd: 44,
    cardPad: 16,
    statH: 52,
    panelPadY: 8,
    panelPadX: 10,
    pagePadX: 20,
    pagePadY: 16,
    pagePadBottom: 24,
    blockGap: 12,
    kpiGap: 8,
    tableColGap: 6,
    tableRowGap: 2,
    tableRowPadX: 8,
    gapXs: 4,
    gapSm: 6,
    gapMd: 10,
    gapLg: 16,
  },
  type: {
    tableHead: 9,
    panelTitle: 9.5,
    helper: 9.5,
    label: 10.5,
    badge: 11,
    tableCell: 10,
    tableBody: 12,
    body: 13,
    sectionTitle: 15,
  },
  badge: { radius: 4, weight: 520, padX: 7, padY: 2, size: 11 },
} as const

export type LinearTokens = typeof t

// 주어진 배경색(hex) 위에서 잘 보이는 글자/아이콘 색(흑 또는 백) 반환.
// 휘도 기반. #RGB / #RRGGBB / #RRGGBBAA(알파 무시) 모두 처리.
export function readableOn(hex: string): string {
  if (!hex || hex[0] !== '#') return '#FFFFFF'
  let h = hex.slice(1)
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  if (h.length === 8) h = h.slice(0, 6)
  if (h.length !== 6) return '#FFFFFF'
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  if ([r, g, b].some(Number.isNaN)) return '#FFFFFF'
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.6 ? '#1A1A1A' : '#FFFFFF'
}

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
