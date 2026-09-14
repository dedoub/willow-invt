'use client'

// 영작 연습 — 상단바(LinearHeader actions)의 토글로 연습 대상 전환.
// 대상 목록과 문구는 lib/english-targets 한 곳에 있다. 여기서는 고르기만 한다.
import { useEnglishProfile } from '@/app/(dashboard)/_components/english-profile'
import { findTarget } from '@/lib/english-targets'
import { PracticeView } from './_components/practice-view'

export default function EnglishPage() {
  const profile = useEnglishProfile()
  const target = findTarget(profile)
  // theme-outline 이 카드와 거기서 열리는 모달의 껍데기를 함께 덮는다. 사업관리와 같은 카드 문법(2026-09-11).
  // key로 완전 리마운트 — 대상 전환 시 큐/입력/결과 상태가 섞이지 않게
  return (
    <div className="theme-outline">
      <PracticeView key={target.id} target={target} />
    </div>
  )
}
