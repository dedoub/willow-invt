/**
 * ui-check 결정적 규칙의 회귀 사례 — 실제로 CEO 가 지적했거나 심사가 오탐한 화면을 최소 HTML 로 되살린다.
 * 규칙을 고치면 이 사례 전부가 다시 돈다. 하나를 고치다 예전 지적을 되살리지 않게.
 *
 *   node --test scripts/lib/ui-check-rules.test.mjs
 *
 * 새 지적이 나오면: 그 화면의 모양을 fixture 로 한 건 더하고(kind: 'defect'), 규칙을 고쳐 통과시킨다.
 * 오탐이 나오면: kind: 'ok' 로 한 건 더한다.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { RULES_SOURCE } from './ui-check-rules.mjs'

// 카드 한 장. head 는 제목 줄(안에 도구를 넣을 수 있다), body 는 제목 아래. gap 은 제목 아래 여백(px).
// foot 은 카드 맨 아래 출처·기준 줄(LCardFoot). 규칙 9 를 보는 사례 말고는 늘 단다.
const card = ({ title, tools = '', body = '<div>내용</div>', gap = 18, foot = true }) => `
  <div data-lcard style="width:640px;padding:16px;margin:12px">
    <div data-section-head style="display:flex;justify-content:space-between;height:28px;margin-bottom:${gap}px">
      <span>${title}</span><span>${tools}</span>
    </div>
    ${body}
    ${foot ? '<div data-card-foot><span>은행 거래내역 자동 수집</span><span>12건</span></div>' : ''}
  </div>`
const chips = (labels) => `<div data-filter-chips>${labels.map(l => `<button data-filter-chip>${l}</button>`).join('')}</div>`
const rows = (n) => Array.from({ length: n }, (_, i) => `<div data-table-row style="height:20px">행${i + 1}</div>`).join('')

const CASES = [
  // ── 실제 지적 (2026-09-28, 주식포트폴리오) ──
  { id: 'title-spaced', kind: 'defect', rule: '1-title-joined', note: '"보유현황, 보유종목 이렇게 붙여써줘"',
    html: card({ title: '보유 종목' }) },
  { id: 'title-long', kind: 'defect', rule: '1-title-length', note: '"4~5글자로" — 포트폴리오시그널',
    html: card({ title: '포트폴리오시그널' }) },
  { id: 'filter-under-title', kind: 'defect', rule: '2-filter-in-head', note: '"필터는 모두 카드 제목 우측에 정렬"',
    html: card({ title: '보유종목', body: chips(['전체', '국내', '해외']) + '<div>표</div>' }) },
  { id: 'long-table-no-pager', kind: 'defect', rule: '5-pagination', note: '"섹터수익률 카드에도 페이지네이션" — 56행',
    html: card({ title: '섹터수익률', body: rows(56) }) },
  { id: 'pie-tabs', kind: 'defect', rule: '6-no-tabs', note: '"탭으로 가리지 말고" — 파이 3개가 탭 뒤에',
    html: card({ title: '성과분석', body: `<div data-panel><div data-panel-title>포트폴리오 비중</div>${chips(['테마별', 'AI 인프라 세부', '국내/해외'])}<div>도넛</div></div>` }) },
  { id: 'letter-badge', kind: 'defect', rule: '7-word-badges', note: '"섹터나 벤치마크 etf는 구분되게" — S·H·B 배지',
    html: card({ title: '섹터수익률', body: '<div><span data-badge>S</span> SEMI</div><div><span data-badge>B</span> SPY</div>' }) },
  { id: 'tight-title-gap', kind: 'defect', rule: '8-title-gap', note: '"간격이 훨씬 넓어보이는데" — 제목 아래 8px',
    html: card({ title: '투자시그널', gap: 8 }) },

  // ── 실제 지적 (2026-09-29, 전 화면) ──
  { id: 'no-card-foot', kind: 'defect', rule: '9-card-foot', note: '"모든 페이지의 카드에 보이스카드처럼 푸터 영역을 넣어서 통일"',
    html: card({ title: '현금관리', foot: false }) },

  // ── 오탐으로 확인된 것 (지적하면 안 된다) ──
  { id: 'panel-toggle', kind: 'ok', note: '평가액 판 안의 일반/로그 토글은 판 전용이라 제목 줄 규칙 밖',
    html: card({ title: '성과분석', body: '<div data-panel><div data-panel-title>평가액 추이</div><div data-segment-group><button>일반</button><button>로그</button></div></div>' }) },
  { id: 'summary-table', kind: 'ok', note: '분류 요약 표 11행은 페이지 이동 없이 둔다',
    html: card({ title: '보유현황', body: rows(11) }) },
  { id: 'search-first-line', kind: 'ok', note: '검색창은 본문 첫 줄에 남는다',
    html: card({ title: '보유종목', tools: chips(['전체', '국내']), body: '<input placeholder="검색" style="height:28px">' + rows(10) }) },
  { id: 'word-badges', kind: 'ok', note: '글자 배지는 통과',
    html: card({ title: '섹터수익률', body: '<span data-badge>벤치마크</span><span data-table-badge>보유</span>' }) },
  { id: 'inner-card', kind: 'ok', note: '카드 안의 카드(판)는 바깥 카드의 푸터를 쓴다',
    html: card({ title: '성과분석', body: card({ title: '평가액', foot: false }) }) },
]

let browser, page
test.before(async () => { browser = await chromium.launch(); page = await browser.newPage() })
test.after(async () => { await browser?.close() })

for (const c of CASES) {
  test(`${c.kind === 'defect' ? '잡는다' : '넘긴다'}: ${c.id} — ${c.note}`, async () => {
    await page.setContent(`<!doctype html><body style="margin:0;font:13px sans-serif">${c.html}</body>`)
    const found = (await page.evaluate(RULES_SOURCE)).map(v => v.rule)
    if (c.kind === 'defect') assert.deepEqual(found, [c.rule], `기대 ${c.rule}, 실제 ${JSON.stringify(found)}`)
    else assert.deepEqual(found, [], `위반이 없어야 하는데 ${JSON.stringify(found)}`)
  })
}
