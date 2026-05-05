// sector 문자열에서 투자 축(axis) 자동 추론
// 사용자 분류 체계: AI 인프라 / 지정학/안보 / 넥스트
// 새 종목이 watchlist/research에 들어올 때 sector 기반으로 자동 부여.
// 매칭되지 않으면 null 반환 — 수동 부여하도록 둠.

export type InvestmentAxis = 'AI 인프라' | '지정학/안보' | '넥스트'

export function inferAxisFromSector(sector: string | null | undefined): InvestmentAxis | null {
  if (!sector) return null
  const s = sector.toLowerCase().trim()

  // 1) 지정학/안보 — 방산이 다른 카테고리보다 우선 매칭
  if (/방산|defense|military|국방/.test(s)) return '지정학/안보'
  if (/우주|space|위성|satellite|발사체|launch|로켓|rocket/.test(s)) return '지정학/안보'
  if (/우라늄|uranium/.test(s)) return '지정학/안보'
  if (/원자력\s*\/\s*방산|해군.*원자력/.test(s)) return '지정학/안보'
  // 사용자 분류: 한국 자산운용/증권은 지정학/안보 축 (글로벌 macro/안보 익스포저 노출)
  if (/자산운용|증권/.test(s)) return '지정학/안보'

  // 2) 넥스트 — 모빌리티/로보틱스/핀테크/vertical AI
  if (/핀테크|fintech|결제|payments/.test(s)) return '넥스트'
  if (/자동차|모빌리티|mobility|로보틱스|robot|산업\s*자동화|산업자동화|산업용/.test(s)) return '넥스트'
  if (/evtol|도심\s*항공/.test(s)) return '넥스트'
  if (/헬스케어\s*ai|의료\s*ai|biotech\s*ai|tempus/.test(s)) return '넥스트'
  if (/광고\s*ai|마케팅\s*ai|adtech|컨슈머\s*ai/.test(s)) return '넥스트'
  if (/rpa|업무\s*자동화|ai\s*자동화/.test(s)) return '넥스트'
  // 양자컴퓨팅은 ETF가 아닌 경우 넥스트(QBTS/IONQ 등 high-beta moonshot)
  if (/양자컴퓨팅(?!\s*etf)/.test(s) && !/etf/.test(s)) return '넥스트'

  // 3) AI 인프라 — 데이터센터/반도체/전력 스택
  if (/^ai\s|\sai\s|ai\s*반도체|ai\s*메모리|ai\s*스토리지|ai\s*네트워킹|ai\s*냉각|ai\s*데이터센터|ai\s*클라우드|ai\s*에너지|ai\s*전력/.test(s)) return 'AI 인프라'
  if (/반도체|메모리|memory|패키징|광\s*인터커넥트|silicon\s*photonics/.test(s)) return 'AI 인프라'
  if (/데이터센터|datacenter|네트워킹|networking|클라우드|cloud|냉각|cooling|스토리지|storage|컨트롤러/.test(s)) return 'AI 인프라'
  if (/연료전지|smr|소형\s*모듈\s*원자로/.test(s)) return 'AI 인프라'

  return null
}
