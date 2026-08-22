'use client'

// CEO 영작 연습 — 미국식 비즈니스 구어체, 업무위키/이메일 소재. 공용 뷰는 _components/practice-view.
import { PracticeView } from './_components/practice-view'

export default function EnglishPage() {
  return (
    <PracticeView
      profile="ceo"
      eyebrow="COMPOSITION"
      title="영작 연습"
      meta="업무위키·이메일 소재 · 미국식 구어체"
      note="한글 청킹(영어어순)을 보고 영어로 쓰면 AI가 즉시 채점 · 합격 80점"
      dailyGoal={100}
      sourceLabel="위키·이메일"
    />
  )
}
