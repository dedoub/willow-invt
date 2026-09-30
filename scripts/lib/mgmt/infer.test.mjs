import assert from 'node:assert/strict'
import test from 'node:test'
import { inferRules, normalizeSubject } from './infer.mjs'

test('제목 정규화', () => {
  assert.equal(normalizeSubject('Re: [GS네오텍:사용내역서] 26년 7월 AWS, GWS'), '[GS네오텍:사용내역서] 년 AWS, GWS')
  assert.equal(normalizeSubject('[텐소프트웍스] 8월 월말 보고서 송부'), '[텐소프트웍스] 월말 보고서 송부')
})

test('Controller R3: 월 이름은 완전 매치만 (문자 뒤섞임 방지)', () => {
  assert.equal(normalizeSubject('Marketing report for March'), 'Marketing report for')
})

test('매달 비슷한 날 반복되면 규칙', () => {
  const ev = ['2026-06-02', '2026-07-01', '2026-08-03', '2026-09-02'].map((d, i) => ({ company: 'tensw', kind: 'sent_mail', context: 'tensoftworks', to: 'office@seoulsports.or.kr', key: 'sent_mail:office@seoulsports.or.kr:[텐소프트웍스] 월말 보고서 송부', label: '서울시체육회 월말 보고서 송부', date: d, ref: `m${i}` }))
  const r = inferRules(ev, { existingRules: [] })
  assert.equal(r.length, 1)
  assert.equal(r[0].rule.day, 2)
  assert.equal(r[0].origin, 'inferred')
  assert.equal(r[0].completion.kind, 'sent_mail')
  assert.ok(r[0].confidence > 0.5)
  assert.equal(r[0].evidence.length, 4)
})

test('날이 들쭉날쭉하면 규칙 아님', () => {
  const ev = ['2026-06-02', '2026-07-20', '2026-08-11'].map((d, i) => ({ company: 'tensw', kind: 'cash', table: 'tensw_mgmt_cash', counterparty: 'X', key: 'cash:tensw_mgmt_cash:X:out', label: 'X 출금', date: d, ref: `c${i}` }))
  assert.equal(inferRules(ev, { existingRules: [] }).length, 0)
})

test('한 달에 여러 번은 한 번으로 센다', () => {
  const ev = ['2026-09-02', '2026-09-03', '2026-09-04'].map((d, i) => ({ company: 'tensw', kind: 'sent_mail', context: 'tensoftworks', to: 'a@b.c', key: 'k', label: 'L', date: d, ref: `m${i}` }))
  assert.equal(inferRules(ev, { existingRules: [] }).length, 0)
})

test('씨앗 규칙과 같은 일은 제외', () => {
  const ev = ['2026-07-22', '2026-08-21', '2026-09-22'].map((d, i) => ({ company: 'tensw', kind: 'sent_mail', context: 'tensoftworks', to: 'jjtaxro@daum.net', key: 'sent_mail:jjtaxro@daum.net:급여대장 요청', label: '급여대장 요청', date: d, ref: `m${i}` }))
  const seed = [{ company: 'tensw', task_key: 'payroll', step: 'request', completion: { kind: 'sent_mail', context: 'tensoftworks', to: 'jjtaxro@daum.net', subject: '급여' } }]
  assert.equal(inferRules(ev, { existingRules: seed }).length, 0)
})
