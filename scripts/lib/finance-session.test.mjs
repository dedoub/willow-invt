import assert from 'node:assert/strict'
import test from 'node:test'
import { PAGE_TEXT_SCRIPT, SESSION_STATE, sessionCompanyFromText, sessionState } from './finance-session.mjs'

// 실제 화면에서 그대로 가져온 문구.
const NHIS_TENSW = '처음으로 로그아웃 마이페이지 온라인도우미 주식회사 텐소프트웍스 (Ten Softworks Inc.)님 환영합니다.'
const WETAX_WILLOW = '위택스 28:29 로그인연장 통합검색 열기 로그아웃 ... 텍스봇 상단바로가기 윌로우인베스트먼트 주식회사'
const WETAX_SIGNED_OUT = '위택스 로그인 회원가입 ... 자동으로 로그아웃 되었습니다. 안전한 서비스 이용과 타인의 부정 사용을 막'

test('sessionCompanyFromText names the company the page is signed in as', () => {
  assert.equal(sessionCompanyFromText(NHIS_TENSW), 'tensw')
  assert.equal(sessionCompanyFromText(WETAX_WILLOW), 'willow')
  assert.equal(sessionCompanyFromText(WETAX_SIGNED_OUT), null)
})

test('a session belonging to the other company is never treated as ours', () => {
  // 2026-08-26에 실제로 난 사고: 윌로우 수집인데 텐소 세션이 살아 있었다.
  assert.equal(sessionState(NHIS_TENSW, 'willow'), SESSION_STATE.other)
  assert.equal(sessionState(NHIS_TENSW, 'tensw'), SESSION_STATE.ours)
  assert.equal(sessionState(WETAX_WILLOW, 'willow'), SESSION_STATE.ours)
  assert.equal(sessionState(WETAX_WILLOW, 'tensw'), SESSION_STATE.other)
})

test('a signed-out page is not a session even when 로그아웃 is still on it', () => {
  assert.equal(sessionState(WETAX_SIGNED_OUT, 'willow'), SESSION_STATE.none)
  // 이름은 남아 있는데 자동 로그아웃된 화면.
  assert.equal(
    sessionState('윌로우인베스트먼트 주식회사 자동으로 로그아웃 되었습니다.', 'willow'),
    SESSION_STATE.none,
  )
})

test('OCR이 윌을 월로 읽은 표기도 같은 회사로 본다', () => {
  assert.equal(sessionCompanyFromText('월로우인베스트먼트 주식회사님 환영합니다'), 'willow')
})

test('PAGE_TEXT_SCRIPT는 한 줄짜리 표현식이라 그대로 주입할 수 있다', () => {
  assert.ok(!PAGE_TEXT_SCRIPT.includes('\n'))
})
