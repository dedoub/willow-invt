// 국가코드 표기 공용 유틸 — voicecards-block에서 추출 (2026-07-15).
// 분포 파이 라벨 "🇺🇸 미국" 스타일을 보이스카드/리뷰노트가 공유한다.

export const COUNTRY_NAMES: Record<string, string> = {
  KR: '한국', US: '미국', JP: '일본', CN: '중국', TW: '대만', HK: '홍콩', GB: '영국', DE: '독일',
  FR: '프랑스', ES: '스페인', IT: '이탈리아', BR: '브라질', RU: '러시아', IN: '인도', ID: '인도네시아',
  VN: '베트남', TH: '태국', PH: '필리핀', TR: '터키', NL: '네덜란드', PL: '폴란드', CA: '캐나다',
  AU: '호주', MX: '멕시코', SG: '싱가포르', MY: '말레이시아', SA: '사우디', AE: 'UAE', CO: '콜롬비아',
  AT: '오스트리아', VE: '베네수엘라', UA: '우크라이나', PK: '파키스탄', AR: '아르헨티나', BO: '볼리비아',
  SV: '엘살바도르', CL: '칠레', CZ: '체코', EE: '에스토니아', EG: '이집트', IE: '아일랜드', MA: '모로코',
  MZ: '모잠비크', NP: '네팔', PT: '포르투갈', UZ: '우즈베키스탄', NG: '나이지리아', ZA: '남아공',
  SC: '세이셸',
}

// ISO 3166-1 alpha-2 → 국기 이모지 (지역 표시 기호). 임의 2자리 코드 지원.
export function codeToFlag(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return '🏳️'
  const cc = code.toUpperCase()
  return String.fromCodePoint(...[...cc].map(c => 0x1f1e6 + c.charCodeAt(0) - 65))
}

// 분포 차트 라벨용: "🇺🇸 미국" / 미상
export function formatCountryName(code: string): string {
  if (!code || code === 'unknown' || code === 'Unknown') return '미상'
  const cc = code.toUpperCase()
  if (!/^[A-Z]{2}$/.test(cc)) return code
  return `${codeToFlag(cc)} ${COUNTRY_NAMES[cc] || cc}`
}
