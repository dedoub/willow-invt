'use client'

// 영작 연습 — 상단바(LinearHeader actions)의 토글로 연습 대상 전환.
// 대상 목록과 문구는 lib/english-targets 한 곳에 있다. 여기서는 고르기만 한다.
import { useState } from 'react'
import { t } from '@/app/(dashboard)/_components/linear-tokens'
import { useEnglishProfile } from '@/app/(dashboard)/_components/english-profile'
import { findTarget } from '@/lib/english-targets'
import { PracticeView, type EnglishView } from './_components/practice-view'
import { SentenceList } from './_components/sentence-list'

export default function EnglishPage() {
  const profile = useEnglishProfile()
  const target = findTarget(profile)
  // 연습하기와 문장 목록은 한 번에 하나만 본다(CEO 2026-09-14). 탭은 통계 카드 머리에 있다.
  const [view, setView] = useState<EnglishView>('practice')

  return (
    // theme-outline 이 카드와 거기서 열리는 모달의 껍데기를 함께 덮는다. 사업관리와 같은 카드 문법(2026-09-11).
    <div className="theme-outline" style={{ display: 'flex', flexDirection: 'column', gap: t.density.blockGap }}>
      {/* key로 완전 리마운트 — 대상 전환 시 큐/입력/결과 상태가 섞이지 않게 */}
      <PracticeView key={target.id} target={target} view={view} onViewChange={setView} />
      {/* 목록은 열 때 읽는다. 연습하는 동안은 붙여 두지 않아 문제은행을 통째로 긁을 일이 없고,
          돌아오면 그때의 기록으로 다시 읽는다. */}
      {view === 'list' && <SentenceList key={`list-${target.id}`} target={target} />}
    </div>
  )
}
