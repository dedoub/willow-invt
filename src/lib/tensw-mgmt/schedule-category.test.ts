import assert from 'node:assert/strict'
import test from 'node:test'
import { getScheduleCategory } from './schedule-category'

test('명시적 재무 일정과 기존 재무 제목을 재무로 분류한다', () => {
  assert.equal(getScheduleCategory({ category: 'finance', title: '아무 제목' }), 'finance')
  assert.equal(getScheduleCategory({ category: null, title: '7월 급여이체' }), 'finance')
  assert.equal(getScheduleCategory({ category: null, title: '서울시체육회 세금계산서 발행' }), 'finance')
})

test('재무 표시가 없는 일반 일정은 기타로 분류한다', () => {
  assert.equal(getScheduleCategory({ category: null, title: '평택대학교 계약' }), 'other')
})
