'use client'

// 류하 영작 연습 — 영국식 영어, ISEB/위콤애비 인터뷰 대비. 류하 노트 소재.
// 보이스카드 담기는 류하 전용 덱으로 들어간다 (문장 profile 기준, /api/english/to-voicecards).
import { PracticeView } from '../../english/_components/practice-view'

export default function RyuhaEnglishPage() {
  return (
    <PracticeView
      profile="ryuha"
      eyebrow="INTERVIEW PREP"
      title="류하 영작 연습"
      meta="류하 노트(ISEB·위콤애비) 소재 · 영국식 구어체"
      note="인터뷰에서 실제로 말할 문장을 한글 청킹(영어어순)으로 보고 영어로 쓰면 AI가 즉시 채점 · 합격 80점"
      dailyGoal={20}
      sourceLabel="류하 노트"
    />
  )
}
