// Guards against collecting one company's data under the other's name.
//
// The shared portals (위택스 · 사회보험 · 홈택스) keep a server-side session tied to
// a cookie in the default browser, so opening the page after a Tensoftworks run
// silently restores that session. A collector that only asks "is someone logged
// in?" then writes Tensoftworks figures into Willow's ledger — which is exactly
// what happened on 2026-08-26 before the import was stopped by hand.
//
// So a session is only usable when the page names the company we are collecting
// for. Anything else is logged out first.

import { financeCompany, financeCompanies } from './tensw-local-finance.mjs'

/** 페이지 텍스트에서 로그인 주체가 어느 회사인지 읽는다. 모르면 null. */
export function sessionCompanyFromText(text) {
  const body = String(text ?? '').replace(/\s+/g, '')
  for (const company of financeCompanies()) {
    const { sessionMarkers } = financeCompany(company)
    if (sessionMarkers.some(marker => body.includes(marker.replace(/\s+/g, '')))) return company
  }
  return null
}

export const SESSION_STATE = Object.freeze({
  /** 로그인되어 있고, 우리 회사다. */
  ours: 'ours',
  /** 로그인되어 있는데 다른 회사다. 먼저 로그아웃해야 한다. */
  other: 'other',
  /** 로그아웃 상태다. */
  none: 'none',
})

/**
 * 로그아웃 표시만으로 판단하지 않는다. 로그아웃 링크는 로그아웃 화면에도 남아
 * 있고("자동으로 로그아웃 되었습니다"), 반대로 이름은 있는데 세션이 끊긴 경우도
 * 있어서 둘을 함께 본다.
 */
export function sessionState(text, company) {
  const body = String(text ?? '')
  const owner = sessionCompanyFromText(body)
  if (owner && owner !== company) return SESSION_STATE.other

  const signedOut = /자동\s*(?:으로)?\s*로그아웃\s*(?:되었습니다|하였습니다)/.test(body)
  if (owner === company && !signedOut) return SESSION_STATE.ours
  return SESSION_STATE.none
}

/** 페이지 전체 텍스트를 읽어오는 스크립트. 수집기가 chromeJavascript 로 던진다. */
export const PAGE_TEXT_SCRIPT = "(() => document.body.innerText.replace(/\\s+/g, ' '))()"

/** 로그아웃 링크를 눌러 남의 세션을 끊는다. */
export const LOGOUT_SCRIPT = `(() => {
  const visible = element => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const link = [...document.querySelectorAll('a,button')]
    .filter(visible)
    .find(element => (element.innerText || '').trim() === '로그아웃');
  if (!link) return 'no-logout';
  link.click();
  return 'clicked';
})()`
