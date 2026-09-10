import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyScheduleTitle, getScheduleCategory } from './schedule-category'

test('stored category wins', () => {
  assert.equal(getScheduleCategory({ category: 'revenue', title: '세금 납부' }), 'revenue')
  assert.equal(getScheduleCategory({ category: 'other', title: '매출대금 입금' }), 'other')
})

test('legacy finance and null fall back to title classification', () => {
  assert.equal(getScheduleCategory({ category: 'finance', title: '[재무] 매출대금 입금 · 성균관대학교 · ₩50,000,000' }), 'revenue')
  assert.equal(getScheduleCategory({ category: 'finance', title: '[재무] 매입대금 이체 · 세무법인형운 · ₩165,000' }), 'expense')
  assert.equal(getScheduleCategory({ category: null, title: '부가세 1차 납부' }), 'expense')
  assert.equal(getScheduleCategory({ category: null, title: '이맥스시스템 중도금 5.5천만원 수금' }), 'revenue')
  assert.equal(getScheduleCategory({ category: null, title: '급여대장 요청' }), 'expense')
  assert.equal(getScheduleCategory({ category: null, title: '킥오프 미팅' }), 'other')
})

test('sales tax invoice is revenue, purchase tax invoice is expense', () => {
  assert.equal(classifyScheduleTitle('[재무] 매출 세금계산서 · 평택대학교 · ₩10,000,000'), 'revenue')
  assert.equal(classifyScheduleTitle('[재무] 매입 세금계산서 · GS네오텍 · ₩721,101'), 'expense')
})
