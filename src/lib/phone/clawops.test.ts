import assert from 'node:assert/strict'
import test from 'node:test'

import { chatCard, chatText, computeSignature, parseRecord, pickEvent } from './clawops'

const memo = [
  '[AI] 안녕하세요, 텐소프트웍스입니다. 지금 담당자가 전화를 받기 어려워 AI 비서가 대신 받았습니다.',
  '[발신자] 체육회 홈페이지 건으로 오늘 중에 연락 부탁드려요.',
  '[AI] 확인하겠습니다. 성함 김은희, 소속 서울시체육회, 회신 번호 010-1234-5678, 용건 홈페이지 수정 요청 맞으신가요?',
  '[발신자] 네.',
].join('\n')

test('복창 문장에서 이름·소속·번호·용건을 읽고 급함을 잡는다', () => {
  const r = parseRecord(memo)
  assert.equal(r.name, '김은희')
  assert.equal(r.org, '서울시체육회')
  assert.equal(r.callbackNumber, '010-1234-5678')
  assert.equal(r.purpose, '홈페이지 수정 요청')
  assert.equal(r.category, '문의')
  assert.equal(r.urgent, true)
  assert.equal(r.needsCallback, true)
})

test('광고 마무리 문장이면 광고로 분류하고 회신하지 않는다', () => {
  const r = parseRecord('[AI] 안녕하세요\n[발신자] 기업 대출 상품 안내드리려고요\n[AI] 광고 전화로 확인되어 따로 전달하지 않습니다.')
  assert.equal(r.category, '광고')
  assert.equal(r.needsCallback, false)
  assert.equal(r.urgent, false)
})

test('녹취가 없으면 빈 기록', () => {
  const r = parseRecord(null)
  assert.equal(r.name, null)
  assert.equal(r.needsCallback, false)
})

test('본문 형식이 달라도 callId 를 찾는다', () => {
  assert.equal(pickEvent({ CallId: 'CA1', CallStatus: 'completed' }).callId, 'CA1')
  assert.equal(pickEvent({ type: 'summary.completed', data: { callId: 'CA2' } }).callId, 'CA2')
  assert.equal(pickEvent({ foo: 1 }).callId, null)
})

test('서명은 SDK 와 같은 방식', () => {
  // url + 정렬된 key·value, HMAC-SHA256 base64
  assert.equal(computeSignature('https://x/y', { b: '2', a: '1' }, 'k'), computeSignature('https://x/y', { a: '1', b: '2' }, 'k'))
})

test('구글챗 문장', () => {
  const t = chatText({ from: '01012345678', startedAt: '2026-10-02T01:05:00Z', durationSec: 48 }, parseRecord(memo), { coreSummary: '홈페이지 수정 요청', followUps: ['오늘 중 회신'] })
  assert.match(t, /^🔴 📞 대표번호 부재중 — 김은희 · 서울시체육회 \(010-1234-5678\)/)
  assert.match(t, /회신 필요/)
  assert.match(t, /• 오늘 중 회신/)
})

test('형식대로 복창하지 않아도 성함·연락처가 든 마지막 AI 줄을 읽는다', () => {
  const r = parseRecord('[AI] 무엇을 도와드릴까요\n[발신자] 도서관 홈페이지 유지 보수 건입니다\n[AI] 네, 용건은 도서관 홈페이지 유지 보수 관련 문의, 성함은 김동욱, 연락처는 010-9621-0010.')
  assert.equal(r.name, '김동욱')
  assert.equal(r.callbackNumber, '010-9621-0010')
  assert.equal(r.purpose, '도서관 홈페이지 유지 보수 관련 문의')
  assert.equal(r.needsCallback, true)
})

test('카드: 헤더·회신 번호·녹취 접기', () => {
  const m = chatCard({ callId: 'CA1', from: '01096291025', startedAt: '2026-10-01T15:29:04Z', durationSec: 61 }, parseRecord(memo), { coreSummary: '요약' }, memo) as { cardsV2: { card: { header: { subtitle: string }; sections: { header?: string; collapsible?: boolean }[] } }[] }
  const card = m.cardsV2[0].card
  assert.match(card.header.subtitle, /김은희 · 서울시체육회 · 010-1234-5678/)
  assert.equal(card.sections.find(s => s.header === '녹취')?.collapsible, true)
})
