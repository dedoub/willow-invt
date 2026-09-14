'use client'

// 영작 연습 — 상단바(LinearHeader actions)의 토글로 연습 대상 전환.
// 대상 목록과 문구는 lib/english-targets 한 곳에 있다. 여기서는 고르기만 한다.
import { useState, useCallback } from 'react'
import { t } from '@/app/(dashboard)/_components/linear-tokens'
import { useEnglishProfile } from '@/app/(dashboard)/_components/english-profile'
import { findTarget } from '@/lib/english-targets'
import { PracticeView } from './_components/practice-view'
import { SentenceList } from './_components/sentence-list'

export default function EnglishPage() {
  const profile = useEnglishProfile()
  const target = findTarget(profile)
  // 채점이 끝날 때마다 올려 아래 목록이 다시 읽게 한다.
  const [graded, setGraded] = useState(0)
  const onGraded = useCallback(() => setGraded(n => n + 1), [])

  return (
    // theme-outline 이 카드와 거기서 열리는 모달의 껍데기를 함께 덮는다. 사업관리와 같은 카드 문법(2026-09-11).
    <div className="theme-outline" style={{ display: 'flex', flexDirection: 'column', gap: t.density.blockGap }}>
      {/* key로 완전 리마운트 — 대상 전환 시 큐/입력/결과 상태가 섞이지 않게 */}
      <PracticeView key={target.id} target={target} onGraded={onGraded} />
      {/* 목록은 연습 아래에 둔다. 매일 하는 일은 연습이고 목록은 가끔 돌아보는 것이라
          연습 앞을 막지 않는다(CEO 2026-09-14). */}
      <SentenceList key={`list-${target.id}`} target={target} reloadKey={graded} />
    </div>
  )
}
