'use client'

// 영작 연습 — 상단바(LinearHeader actions)의 나/류하 토글로 프로필 전환.
// 나: 미국식 비즈니스(위키/이메일 소재, 100/일) · 류하: 영국식 ISEB 인터뷰 대비(류하 노트+ISEB 문항, 20/일)
import { useEnglishProfile } from '@/app/(dashboard)/_components/english-profile'
import { PracticeView, PracticeViewProps } from './_components/practice-view'

const CONFIGS: Record<'ceo' | 'ryuha' | 'ryuha_written', PracticeViewProps> = {
  ceo: {
    profile: 'ceo',
    eyebrow: 'COMPOSITION',
    title: '영작 연습',
    meta: '업무위키·이메일 소재 · 미국식 구어체',
    note: '한글 청킹(영어어순)을 보고 영어로 쓰면 AI가 즉시 채점 · 합격 80점',
    dailyGoal: 100,
    sourceLabel: '위키·이메일',
  },
  ryuha: {
    profile: 'ryuha',
    eyebrow: 'INTERVIEW PREP',
    title: '류하 영작 연습 · 구어',
    meta: '류하 노트·ISEB 문항 소재 · 영국식 구어체',
    note: '인터뷰에서 실제로 말할 문장을 한글 청킹(영어어순)으로 보고 영어로 쓰면 AI가 즉시 채점 · 합격 80점',
    dailyGoal: 20,
    sourceLabel: '류하 노트',
  },
  ryuha_written: {
    profile: 'ryuha_written',
    eyebrow: 'WRITTEN ENGLISH',
    title: '류하 영작 연습 · 문어',
    meta: '류하 노트·ISEB 문항 소재 · 영국식 문어체 (리딩·라이팅 대비)',
    note: '시험 답안·작문에 쓸 문장을 한글 청킹(영어어순)으로 보고 영어로 쓰면 AI가 즉시 채점 · 합격 80점',
    dailyGoal: 20,
    sourceLabel: '류하 노트',
  },
}

export default function EnglishPage() {
  const profile = useEnglishProfile()
  // key로 완전 리마운트 — 프로필 전환 시 큐/입력/결과 상태가 섞이지 않게
  return <PracticeView key={profile} {...CONFIGS[profile]} />
}
