'use client'

// 영작 연습 — 업무위키/이메일 소재의 한글 청킹(영어어순) 문제를 보고 영어로 쓰면 AI가 즉시 채점.
// 목표: 누적 학습 문장을 늘리고, 마지막 시도 기준 정답률을 100%에 가깝게.

import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { DrawPad, type DrawPadHandle } from '@/app/(dashboard)/_components/linear-draw-pad'
import { DrawTools, useDrawTools } from '@/app/(dashboard)/_components/linear-draw-tools'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LStat } from '@/app/(dashboard)/_components/linear-stat'
import { LBtn } from '@/app/(dashboard)/_components/linear-btn'
import { LBadge } from '@/app/(dashboard)/_components/linear-badge'
import { LSegmented } from '@/app/(dashboard)/_components/linear-segmented'
import { LSectionHead, LHeadBtn } from '@/app/(dashboard)/_components/linear-section-head'
import type { PracticeTarget } from '@/lib/english-targets'
import {
  correctionDiff, chunkRecord, easedLevel, HINT_CHUNKS, HINT_SENTENCE, HINT_TOPIC, HINT_LABEL,
  type HintLevel,
} from '@/lib/english-practice-review'
import { useDictation } from './use-dictation'
import { appendTranscript } from '@/lib/dictation'

type Mode = 'new_heavy' | 'balanced' | 'review_heavy'

// 신규 문항 선발 순서 — 서버의 FreshOrder와 같은 값이어야 한다
const ORDER_OPTIONS: { value: string; label: string; title: string }[] = [
  { value: 'oldest', label: '오래된 순', title: '아직 안 푼 문항 중 가장 오래된 것부터' },
  { value: 'spread', label: '종류 고르게', title: '업무·비즈니스 회화·일상을 돌아가며 섞어 출제' },
  { value: 'random', label: '무작위', title: '아직 안 푼 문항 전체에서 무작위로' },
  { value: 'newest', label: '최신 순', title: '방금 만든 문항부터' },
]

export interface PracticeViewProps {
  target: PracticeTarget
}

interface QueueItem {
  id: string
  korean_full: string
  korean_chunks: string[]
  /** 조각별 영어 — 의미조각을 눌러 뒤집을 때 보여 준다. 한글 조각과 1:1로 맞는다. */
  english_chunks?: string[] | null
  reference_english: string
  topic: string | null
  is_review: boolean
  /** 연속 정답 수로 서버가 정한 힌트 단계. 1=청킹 2=문장 전체 3=주제만 */
  hint_level?: HintLevel
}

interface Stats {
  today: { fresh: number; review: number; date: string }
  daily: { date: string; fresh: number; review: number }[]
  totalItems: number
  attemptedItems: number
  passedItems: number
  accuracy: number
  freshRemaining: number
  reviewRemaining: number
}

interface GradeResult {
  score: number
  passed: boolean
  corrected: string
  natural: string
  reference: string
  points: { type: string; note: string }[]
  /** 손글씨 채점일 때 — 모델이 읽어낸 문장 */
  transcript?: string
  /** false면 연습용 재시도라 시도로 남지 않았다 */
  recorded?: boolean
  /** 점수는 합격선을 넘었는가. 힌트를 봤으면 passed 는 false 라도 이건 true 일 수 있다. */
  scored?: boolean
  usedHint?: boolean
}

// 색은 상태·부호·강조에만 쓴다(linear-tokens 주석). 문법·단어·자연스러움은 '어떤 종류의
// 지적인가'라는 분류지 부호가 아니다 — 네 가지 색을 쓰면 한 줄에 무지개가 뜬다.
// 부호는 둘뿐이다: 잘했다(초록) / 고칠 것(회색). 종류는 옆의 글자가 이미 말한다.
const POINT_TONE: Record<string, 'neutral' | 'pos'> = {
  grammar: 'neutral', word: 'neutral', natural: 'neutral', good: 'pos', meaning: 'neutral',
}
const POINT_LABEL: Record<string, string> = {
  grammar: '문법', word: '단어', natural: '자연스러움', good: '좋음', meaning: '의미',
}

export function PracticeView({ target }: PracticeViewProps) {
  const { id: profile, title, meta, note, dailyGoal, sourceLabel } = target
  const mobile = useIsMobile()
  const [mode, setMode] = useState<Mode>('balanced')
  const [order, setOrder] = useState('oldest')
  const [loading, setLoading] = useState(true)
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [idx, setIdx] = useState(0)
  const [stats, setStats] = useState<Stats | null>(null)
  const [answer, setAnswer] = useState('')
  const [grading, setGrading] = useState(false)
  const [result, setResult] = useState<GradeResult | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [vcState, setVcState] = useState<'idle' | 'sending' | 'done'>('idle')
  // 류하는 영문 키보드가 서툴러 펜슬 손글씨가 기본. CEO는 타이핑 고정.
  const [inputMode, setInputMode] = useState<'type' | 'draw'>(target.defaultInput)
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen')
  const [hasInk, setHasInk] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const tools = useDrawTools('english-practice-tools')

  // 위쪽 바로 세운 도구 바가 오른쪽 판을 밀어 내린 만큼, 왼쪽에도 같은 높이를 비워 둔다.
  //
  // 바의 높이만 재면 6px 모자란다. 바는 제 아래 여백을 갖고 있고 칸 자체도 자식 사이를
  // 띄우기 때문이다. 그래서 바 꼭대기에서 판 꼭대기까지를 통째로 잰다 — 여백이 몇 겹이든
  // 그 값 하나로 맞는다.
  const [drawBarH, setDrawBarH] = useState(0)
  useEffect(() => {
    if (inputMode !== 'draw' || !tools.docked) { setDrawBarH(0); return }
    const bar = tools.toolsRef.current
    const box = tools.boxRef.current
    if (!bar || !box) return
    const measure = () => {
      const gap = Math.round(box.getBoundingClientRect().top - bar.getBoundingClientRect().top)
      if (gap > 0) setDrawBarH(gap)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(bar)
    observer.observe(box)
    return () => observer.disconnect()
  }, [tools.docked, tools.toolsRef, tools.boxRef, inputMode])

  // 어느 의미조각이 뒤집혀 있나. 문항이 바뀌면 전부 덮는다.
  const [flipped, setFlipped] = useState<Set<number>>(new Set())

  // 이번 문항에서 힌트를 몇 단계 되돌렸나. 조각을 뒤집는 것도 답을 보는 것이라 같이 센다 —
  // 그러지 않으면 단계를 올려 놓고 조각만 뒤집어 우회할 수 있다(2026-09-14).
  const [stepsBack, setStepsBack] = useState(0)
  const usedHint = stepsBack > 0 || flipped.size > 0

  // 채점 뒤 한 번 더 쓰는 판. 답을 보고 같은 문장을 다시 써 보는 자리라
  // 채점에 들어가지 않는다 — 여기 쓴 것은 어디에도 기록되지 않는다.
  const againRef = useRef<DrawPadHandle | null>(null)
  // 다시 써보기도 펜·자판 둘 다 쓴다. 처음 값은 위 입력칸과 같게 두되 따로 바꿀 수 있다 —
  // 손으로 풀고 나서 자판으로 정리해 보는 쓰임이 있다(CEO 2026-09-14).
  const [againMode, setAgainMode] = useState<'type' | 'draw'>(target.defaultInput)
  const [againText, setAgainText] = useState('')
  const [againTool, setAgainTool] = useState<'pen' | 'eraser'>('pen')
  const [againInk, setAgainInk] = useState(false)
  const [againRedo, setAgainRedo] = useState(false)
  const againTools = useDrawTools('english-practice-again-tools')
  // "다시 풀기"로 다시 푸는 중. 교정문·참고 답안을 이미 본 뒤라 이후 채점은
  // 기록하지 않는다 — 다음 문항으로 넘어가야 풀린다.
  const [retrying, setRetrying] = useState(false)
  const padRef = useRef<DrawPadHandle | null>(null)
  const taRef = useRef<HTMLTextAreaElement | null>(null)
  // 마이크 받아쓰기 — 인식 결과를 입력창에 이어붙이고, 사용자가 고친 뒤 채점한다.
  // 류하는 영국식으로 연습하므로 인식 언어도 갈라 준다.
  const dictation = useDictation({
    lang: profile === 'ryuha' ? 'en-GB' : 'en-US',
    onFinal: (text) => setAnswer(prev => appendTranscript(prev, text)),
    onError: setError,
  })
  const generatingRef = useRef(false)
  // 자동 충전이 실패했을 때 무한 재시도 방지 — 수동 생성 버튼을 누르면 해제
  const autoRefillBlockedRef = useRef(false)

  const loadQueue = useCallback(async (m: Mode, o: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/english/queue?mode=${m}&profile=${profile}&order=${o}`)
      if (!res.ok) throw new Error(`queue ${res.status}`)
      const data = await res.json()
      setQueue(data.queue)
      setStats(data.stats)
      setIdx(0)
      setAnswer('')
      setResult(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '로드 실패')
    } finally {
      setLoading(false)
    }
  }, [profile])

  useEffect(() => { loadQueue(mode, order) }, [loadQueue, mode, order])

  const current = queue[idx] ?? null

  // 이 문항의 힌트 단계. 서버가 연속 정답 수로 정해 주고, 힌트를 누른 만큼 되돌린다.
  const baseLevel: HintLevel = current?.hint_level ?? HINT_CHUNKS
  const level = easedLevel(baseLevel, stepsBack)
  // 단계를 거꾸로 읽어 연속 회수를 대강 보여 준다 — 정확한 수가 아니라 "얼마나 왔나"다.
  const streakOf = (it: QueueItem) => (it.hint_level ?? HINT_CHUNKS) >= HINT_TOPIC ? 3 : 2

  // 다시 써보기 판을 왼쪽 '네이티브 버전' 글 상자와 같은 높이에서 시작시킨다.
  //
  // 맞추는 것은 두 구역의 머리가 아니라 **쓰는 면과 읽는 면**이다. 구역 머리를 맞추면
  // 위쪽 선과 라벨은 나란해지지만, 정작 눈이 가는 상자와 판은 여백 차이만큼 어긋난다.
  //
  // 두 칸은 서로 다른 흐름이고 왼쪽 길이는 첨삭 항목 수에 따라 매번 달라져서 고정값으로는
  // 맞출 수 없다. 잰 차이를 그대로 여백에 더한다 — 여백이 오른쪽을 그만큼 밀어 내리므로
  // 한 번에 맞는다. 다시 재는 것은 왼쪽 크기가 바뀔 때뿐이라 서로 밀어내는 일이 없다.
  const nativeRef = useRef<HTMLDivElement | null>(null)
  const retryInputRef = useRef<HTMLDivElement | null>(null)
  const [retryGap, setRetryGap] = useState(0)
  // 의존성 배열을 두지 않는다. 그리고 나서 재고, 어긋나면 고치고, 맞으면 멈춘다.
  // 프레임을 잡아 한 번만 재는 방식은 무엇이 언제 그려지느냐에 기대게 되어 실제로 빗나갔다 —
  // 141px 이 어긋난 채로 여백이 0 에 머물렀다(2026-09-14 실측). 매 그림마다 재면 그럴 일이 없다.
  // 1px 미만이면 손대지 않으므로 서로 밀어내며 도는 일도 없다.
  useLayoutEffect(() => {
    // 한 칸으로 접히는 좁은 화면에서는 맞출 두 칸이 없다.
    if (!result || mobile) {
      if (retryGap !== 0) setRetryGap(0)
      return
    }
    // 라벨까지 감싼 바깥이 아니라, 테두리를 두른 글 상자 자체를 잰다.
    const box = nativeRef.current?.firstElementChild as HTMLElement | null | undefined
    const retry = retryInputRef.current
    if (!box || !retry) return
    const delta = box.getBoundingClientRect().top - retry.getBoundingClientRect().top
    if (Math.abs(delta) < 1) return
    setRetryGap(gap => Math.max(0, gap + delta))
    // 여백이 바뀌면 한 번 더 재서 남은 차이를 마저 없앤다. 1px 미만이면 위에서 멈춘다.
  }, [result, mobile, retryGap])

  // 채점 뒤, 조각마다 답에 실제로 썼는지. 답은 손글씨면 전사된 글이다.
  const chunkHits = result
    ? chunkRecord(current?.english_chunks ?? [], result.transcript ?? answer)
    : null

  const grade = useCallback(async () => {
    if (!current || grading || result) return
    // 채점에 들어가면 더 받아쓸 이유가 없다. 결과 화면에서 마이크가 켜져 있으면
    // 다음 문항 답이 이전 답에 붙는다.
    dictation.stop()
    // 채점 순간의 값을 그대로 보낸다 — 결과를 보고 조각을 뒤집는 것은 힌트가 아니다.
    const drawing = inputMode === 'draw'
    const imageBase64 = drawing ? padRef.current?.getImage() : undefined
    if (drawing ? !imageBase64 : !answer.trim()) return
    setGrading(true)
    setError(null)
    try {
      const res = await fetch('/api/english/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          drawing
            ? { itemId: current.id, imageBase64, isReview: current.is_review, profile, record: !retrying, usedHint }
            : { itemId: current.id, answer, isReview: current.is_review, profile, record: !retrying, usedHint },
        ),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `grade ${res.status}`)
      setResult(data)
      // 로컬 통계 갱신 — 다음 큐 로드 때 서버값으로 재동기화됨.
      // 기록하지 않은 연습 재시도는 건너뛴다. 화면 숫자만 올려두면 다음 큐를
      // 받는 순간 서버값으로 되돌아가 사용자에게는 숫자가 튀어 보인다.
      if (data.recorded !== false) setStats(prev => {
        if (!prev) return prev
        const s = structuredClone(prev) as Stats
        if (current.is_review) s.today.review++
        else s.today.fresh++
        const last = s.daily[s.daily.length - 1]
        if (last) { if (current.is_review) last.review++; else last.fresh++ }
        if (current.is_review) {
          if (data.passed) { s.passedItems++; s.reviewRemaining = Math.max(0, s.reviewRemaining - 1) }
        } else {
          s.attemptedItems++
          s.freshRemaining = Math.max(0, s.freshRemaining - 1)
          if (data.passed) s.passedItems++
          else s.reviewRemaining++
        }
        s.accuracy = s.attemptedItems > 0 ? Math.round((s.passedItems / s.attemptedItems) * 100) : 0
        return s
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : '채점 실패')
    } finally {
      setGrading(false)
    }
  }, [current, answer, grading, result, profile, inputMode, dictation, retrying, usedHint])

  const next = useCallback(() => {
    dictation.stop()
    setRetrying(false)
    setAnswer('')
    setResult(null)
    setVcState('idle')
    padRef.current?.clear()
    setHasInk(false)
    setCanRedo(false)
    setTool('pen')
    setFlipped(new Set())
    setStepsBack(0)
    againRef.current?.clear()
    setAgainInk(false)
    setAgainRedo(false)
    setAgainText('')
    setIdx(i => i + 1)
    // 모바일은 자동 포커스 금지 — 키보드가 멋대로 올라오지 않게, 직접 탭할 때만 연다
    if (!mobile) setTimeout(() => taRef.current?.focus(), 0)
  }, [mobile, dictation])

  // 같은 문항을 한 번 더. 답을 이미 봤으므로 이후 채점은 기록하지 않는다.
  const retry = useCallback(() => {
    dictation.stop()
    setRetrying(true)
    setAnswer('')
    setResult(null)
    setError(null)
    setFlipped(new Set())
    setStepsBack(0)
    padRef.current?.clear()
    setHasInk(false)
    setCanRedo(false)
    if (!mobile) setTimeout(() => taRef.current?.focus(), 0)
  }, [mobile, dictation])

  // 판이 바뀔 때마다 도구의 켜짐·꺼짐을 다시 읽는다. 되돌릴 게 없는데 단추가 살아
  // 있으면 눌러 놓고 왜 아무 일도 없는지 묻게 된다(연습장에서 가져온 규칙).
  const syncTools = useCallback(() => {
    setHasInk(!padRef.current?.isEmpty())
    setCanRedo(!!padRef.current?.canRedo())
  }, [])
  const syncAgain = useCallback(() => {
    setAgainInk(!againRef.current?.isEmpty())
    setAgainRedo(!!againRef.current?.canRedo())
  }, [])

  // 현재 문장을 보이스카드 영어 덱에 청크 행으로 추가 (류하봇 청킹번역과 같은 시트 경로)
  const toVoiceCards = useCallback(async () => {
    if (!current || vcState !== 'idle') return
    setVcState('sending')
    try {
      const res = await fetch('/api/english/to-voicecards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: current.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `voicecards ${res.status}`)
      setVcState('done')
    } catch (e) {
      setVcState('idle')
      setError(e instanceof Error ? e.message : '보이스카드 추가 실패')
    }
  }, [current, vcState])

  const generate = useCallback(async (opts?: { silent?: boolean; reloadIfEmpty?: boolean }) => {
    if (generatingRef.current) return
    generatingRef.current = true
    setGenerating(true)
    if (!opts?.silent) setError(null)
    try {
      const res = await fetch('/api/english/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 50, profile }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `generate ${res.status}`)
      // 문제은행이 늘었으니 남은 문제 수만 즉시 반영
      setStats(prev => prev ? { ...prev, totalItems: prev.totalItems + data.created, freshRemaining: prev.freshRemaining + data.created } : prev)
      if (opts?.reloadIfEmpty) loadQueue(mode, order)
    } catch (e) {
      if (opts?.silent) autoRefillBlockedRef.current = true
      else setError(e instanceof Error ? e.message : '문제 생성 실패')
    } finally {
      generatingRef.current = false
      setGenerating(false)
    }
  }, [loadQueue, mode, order, profile])

  // 신규 문장이 바닥나면(20개 이하 — 하루 100문장 페이스 기준 큐 하나 분량) 백그라운드로 50개 자동 충전.
  // 풀 게 아예 없을 때는 충전 완료 후 큐도 자동 리로드.
  useEffect(() => {
    if (loading || !stats) return
    if (stats.freshRemaining <= 20 && !generatingRef.current && !autoRefillBlockedRef.current) {
      generate({ silent: true, reloadIfEmpty: queue.length === 0 || idx >= queue.length })
    }
  }, [loading, stats, queue.length, idx, generate])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      if (result) next()
      else grade()
    }
  }

  const sparkTotal = stats?.daily.map(d => ({ date: d.date, value: d.fresh + d.review })) ?? []
  const sparkReview = stats?.daily.map(d => ({ date: d.date, value: d.review })) ?? []

  return (
    // keep-all: 한글이 어절 중간에서 줄바꿈되지 않게 (LSectionHead meta와 같은 규칙)
    // 한 줄짜리 읽기 화면일 때는 860이 맞았다. 이제 힌트와 쓰는 자리를 나란히 두므로
    // 그 폭으로는 양쪽 다 좁다. 다른 페이지처럼 폭을 다 쓴다.
    <div style={{
      wordBreak: 'keep-all',
      display: 'flex', flexDirection: 'column', gap: t.density.blockGap,
    }}>
      {/* 상단 통계 — 주식 페이지(포트폴리오 시그널)와 같은 축:
          머리 구역(cardPad, 아래 panelPadY) · 지표 격자 구역(좌우 cardPad, 아래 cardPad). */}
      <LCard pad={0}>
        <div style={{ padding: t.density.cardPad, paddingBottom: t.density.panelPadY }}>
          <LSectionHead
            title={title}
            meta={meta}
            tools={
              <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapSm, flexWrap: 'wrap' }}>
                <LSegmented<Mode>
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: 'new_heavy', label: '신규 위주' },
                    { value: 'balanced', label: '균형' },
                    { value: 'review_heavy', label: '복습 위주' },
                  ]}
                />
                {/* 신규 문항 선발 순서. 복습은 오래 묵은 오답부터가 맞아 고를 게 없다. */}
                <select
                  value={order}
                  onChange={(e) => setOrder(e.target.value)}
                  title={ORDER_OPTIONS.find(o => o.value === order)?.title}
                  aria-label="신규 문항 출제 순서"
                  style={{
                    height: t.density.controlHSm,
                    fontSize: t.type.control,
                    padding: `0 ${t.density.controlPadXSm}px`,
                    borderRadius: t.radius.sm,
                    background: t.neutrals.card,
                    color: t.neutrals.muted,
                    border: `1px solid ${t.neutrals.line}`,
                    fontFamily: t.font.sans,
                    cursor: 'pointer',
                  }}
                >
                  {ORDER_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            }
            action={<LHeadBtn icon="sparkles" label="문제 생성" title={`${sourceLabel}에서 새 문제 50개 생성`} onClick={() => { autoRefillBlockedRef.current = false; generate() }} busy={generating} />}
          />

        </div>

        {/* 안내문 — 탭(모드) 줄과 분리해 헤더 아래 한 줄로 */}
        <div style={{
          fontSize: `calc(${t.type.helper}px * var(--fz, 1))`, color: t.neutrals.subtle,
          lineHeight: 1.5, padding: `0 ${t.density.cardPad}px ${t.density.panelPadY}px`,
        }}>{note}</div>

        {/* 지표 — 오늘 학습량 / 누적 문장 / 정답률 / 남은 문제 */}
        <div>
          <div style={{
            display: 'grid', gap: t.density.kpiGap,
            gridTemplateColumns: mobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(4, minmax(0,1fr))',
            padding: `0 ${t.density.cardPad}px ${t.density.cardPad}px`,
          }}>
            <LStat
              label="오늘 학습"
              value={stats ? String(stats.today.fresh + stats.today.review) : '–'}
              unit={`/ ${dailyGoal}`}
              tone={stats && stats.today.fresh + stats.today.review >= dailyGoal ? 'pos' : 'default'}
              sub={stats ? `신규 ${stats.today.fresh} · 복습 ${stats.today.review}` : ''}
              sparkline={sparkTotal}
              sparkline2={sparkReview}
              title={`오늘 채점받은 문장 수 (KST) — 목표 하루 ${dailyGoal}문장. 스파크라인: 최근 7일 (점선=복습)`}
            />
            <LStat
              label="누적 학습 문장"
              value={stats ? String(stats.attemptedItems) : '–'}
              unit="문장"
              sub={stats ? `문제은행 ${stats.totalItems}` : ''}
              title="한 번이라도 채점받은 고유 문장 수"
            />
            <LStat
              label="정답률"
              value={stats ? `${stats.accuracy}` : '–'}
              unit="%"
              tone={stats ? (stats.accuracy >= 90 ? 'pos' : stats.accuracy >= 70 ? 'default' : 'neg') : 'default'}
              sub="마지막 시도 기준"
              title="문장별 마지막 시도가 합격(80점 이상)인 비율 — 복습으로 100%에 수렴시키는 게 목표"
            />
            <LStat
              label="남은 문제"
              value={stats ? String(stats.freshRemaining) : '–'}
              unit="신규"
              sub={stats ? `복습 대기 ${stats.reviewRemaining}` : ''}
              title="아직 안 푼 신규 문장 / 마지막 시도가 불합격이라 복습이 필요한 문장"
            />
          </div>
        </div>
      </LCard>

      {error && (
        <LCard>
          <span style={{ fontSize: `calc(${t.type.body}px * var(--fz, 1))`, color: t.accent.neg }}>{error}</span>
        </LCard>
      )}

      {loading ? (
        <LCard>
          <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.neutrals.subtle, fontSize: `calc(${t.type.body}px * var(--fz, 1))` }}>
            문제 불러오는 중…
          </div>
        </LCard>
      ) : !current ? (
        <LCard>
          <div style={{ padding: '32px 0', textAlign: 'center' }}>
            <div style={{ fontSize: `calc(${t.type.sectionTitle}px * var(--fz, 1))`, fontWeight: t.weight.semibold, marginBottom: t.density.gapSm }}>
              {queue.length > 0 ? '이번 큐 완료 🎉' : '풀 문제가 없습니다'}
            </div>
            <div style={{ fontSize: `calc(${t.type.body}px * var(--fz, 1))`, color: t.neutrals.muted, marginBottom: t.density.gapLg }}>
              {queue.length > 0
                ? `${queue.length}문장 학습했습니다. 새 큐를 받아 계속하세요.`
                : generating
                  ? '신규 문장 50개를 자동 생성하는 중입니다… 끝나면 큐가 자동으로 열립니다.'
                  : `문제 생성 버튼으로 ${sourceLabel}에서 새 문장 50개를 만드세요.`}
            </div>
            <div style={{ display: 'flex', gap: t.density.gapSm, justifyContent: 'center' }}>
              <LBtn variant="brand" onClick={() => loadQueue(mode, order)}>새 큐 받기</LBtn>
              {queue.length === 0 && !generating && (
                <LBtn onClick={() => { autoRefillBlockedRef.current = false; generate({ reloadIfEmpty: true }) }}>문제 생성</LBtn>
              )}
            </div>
          </div>
        </LCard>
      ) : (
        <>
          {/* 문제 카드 — 왼쪽은 읽는 것(힌트·채점 결과), 오른쪽은 쓰는 것.
              스크립타 풀기 화면과 같은 나눔이다: 눈이 가는 자리와 손이 가는 자리를 섞지 않는다. */}
          <LCard pad={0}>
            {/* 카드에는 제목이 있어야 한다 — 배지만 있으면 이 카드가 무엇인지 말하는 줄이 없다.
                배지는 이 문항이 어떤 것인지를, 오른쪽 숫자는 어디까지 왔는지를 말한다. */}
            <div style={{ padding: t.density.cardPad, paddingBottom: t.density.panelPadY }}>
              <LSectionHead
                title="연습하기"
                tools={
                  <div style={{ display: 'flex', gap: t.density.gapSm, alignItems: 'center' }}>
                    {/* 신규·복습은 분류다. 사업관리 일정과 같이 회색 명도로 가른다 —
                        복습이 한 단계 진하고, 옆의 주제 배지가 가장 옅다. */}
                    <LBadge palette={current.is_review ? { bg: '#D3D7DD', fg: '#1F242B' } : { bg: '#E4E7EB', fg: '#2C323A' }} pill>
                      {current.is_review ? '복습' : '신규'}
                    </LBadge>
                    {current.topic && <LBadge tone="neutral">{current.topic}</LBadge>}
                  </div>
                }
                toolsInline
                action={
                  <span style={{ fontSize: `calc(${t.type.helper}px * var(--fz, 1))`, color: t.neutrals.subtle, fontFamily: t.font.mono, whiteSpace: 'nowrap' }}>
                    {idx + 1} / {queue.length}
                  </span>
                }
                mb={0}
              />
            </div>

            <div style={{
              display: 'grid',
              // 상단바 자리는 대상 토글이 쓰고 있어 1열/2열 토글을 둘 데가 없다. 폭으로만 가른다.
              gridTemplateColumns: mobile ? 'minmax(0,1fr)' : 'minmax(0,1fr) minmax(0,1fr)',
              gap: t.density.blockGap,
              padding: `0 ${t.density.cardPad}px ${t.density.cardPad}px`,
              alignItems: 'start',
            }}>

              {/* ── 왼쪽: 힌트와 채점 결과 ───────────────────────────── */}
              <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: t.density.gapSm }}>
                <div data-panel="">
                  {/* 오른쪽 칸의 첫 줄은 손글씨·키보드 세그먼트다. 여기 제목이 그 줄과 같은
                      높이를 잡아야 두 칸의 본문이 같은 선에서 시작한다.
                      controlHSm(28)이 아니라 28에서 트랙 여백 두 겹을 뺀 값이다 — 세그먼트 단추는
                      원래 트랙 안에 들어앉아 그만큼 작고, 테마가 그 트랙을 없애 단추 키가 곧 줄 키가 된다. */}
                  <div data-panel-title="" style={{
                    fontSize: `calc(${t.type.panelTitle}px * var(--fz, 1))`, fontFamily: t.font.mono, letterSpacing: 0.8,
                    textTransform: 'uppercase' as const, color: t.neutrals.subtle,
                    minHeight: t.density.controlHSm - t.density.tableRowGap * 2,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: t.density.gapSm, marginBottom: t.density.gapSm,
                  }}>
                    <span>{HINT_LABEL[level]}</span>
                    {baseLevel > HINT_CHUNKS && (
                      <span style={{ textTransform: 'none' as const, letterSpacing: 0, fontFamily: t.font.sans }}>
                        연속 {streakOf(current)}회
                      </span>
                    )}
                  </div>

                  {/* 펜 도구를 위쪽 바로 세우면 오른쪽 판이 그 줄만큼 내려간다. 왼쪽도 같이
                      내려가야 두 칸이 계속 같은 선에서 시작한다. 도구 바를 띄워 놓았을 때는
                      판 위에 겹쳐 있어 자리를 차지하지 않으므로 이 칸도 없다. */}
                  {drawBarH > 0 && <div aria-hidden="true" style={{ height: drawBarH }} />}

                  {/* 단계에 따라 보여 주는 것이 줄어든다. 두 번 연속 맞으면 조각을 걷고
                      문장만, 세 번째부터는 주제만 남는다(CEO 2026-09-14). */}
                  {level === HINT_CHUNKS ? (
                    current.korean_chunks.map((chunk, i) => {
                      const en = current.english_chunks?.[i]
                      const open = flipped.has(i) || !!result
                      const wrote = result && chunkHits ? chunkHits[i] : null
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            if (!en || result) return
                            setFlipped(prev => {
                              const nextSet = new Set(prev)
                              if (nextSet.has(i)) nextSet.delete(i)
                              else nextSet.add(i)
                              return nextSet
                            })
                          }}
                          title={result ? undefined : en ? (open ? '눌러서 한글로' : '눌러서 영어 보기 · 힌트로 셉니다') : undefined}
                          data-chunk-line=""
                          style={{
                            width: '100%', textAlign: 'left', border: 'none', background: 'transparent',
                            display: 'flex', alignItems: 'baseline', gap: t.density.gapMd,
                            padding: `${t.density.gapSm}px ${t.density.tableRowPadX}px`,
                            cursor: en && !result ? 'pointer' : 'default',
                            fontSize: `calc(${t.type.body}px * var(--fz, 1))`, lineHeight: 1.5,
                            fontFamily: t.font.sans, color: t.neutrals.text,
                          }}
                        >
                          <span style={{
                            fontSize: `calc(${t.type.helper}px * var(--fz, 1))`, color: t.neutrals.subtle, fontFamily: t.font.mono,
                            minWidth: 14, textAlign: 'right', flexShrink: 0,
                          }}>{i + 1}</span>
                          <span style={{ minWidth: 0, flex: 1, color: open ? t.chart.mono : t.neutrals.text }}>
                            {open && en ? en : chunk}
                          </span>
                          {/* 채점 뒤에만 — 이 조각을 답에 실제로 썼는지. 채점이 아니라 기록이다. */}
                          {wrote !== null && (
                            <span style={{
                              flexShrink: 0, fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`,
                              fontFamily: t.font.mono,
                              color: wrote ? t.accent.pos : t.accent.neg,
                            }}>
                              {wrote ? '썼음' : '빠짐'}
                            </span>
                          )}
                        </button>
                      )
                    })
                  ) : level === HINT_SENTENCE ? (
                    <div style={{
                      padding: `${t.density.gapSm}px ${t.density.tableRowPadX}px`,
                      fontSize: `calc(${t.type.body}px * var(--fz, 1))`, lineHeight: 1.6, color: t.neutrals.text,
                    }}>
                      {current.korean_full}
                    </div>
                  ) : (
                    <div style={{
                      padding: `${t.density.gapSm}px ${t.density.tableRowPadX}px`,
                      fontSize: `calc(${t.type.body}px * var(--fz, 1))`, lineHeight: 1.6, color: t.neutrals.text,
                    }}>
                      {current.topic || '(주제 없음)'}
                      <span style={{ marginLeft: t.density.gapSm, fontSize: `calc(${t.type.helper}px * var(--fz, 1))`, color: t.neutrals.subtle }}>
                        에 대해 한 문장
                      </span>
                    </div>
                  )}
                </div>

                {/* 힌트보기 — 한 단계씩 되돌린다. 누르면 이 시도는 합격으로 세지 않는다. */}
                {!result && level > HINT_CHUNKS && (
                  <LBtn size="sm" variant="ghost"
                    onClick={() => setStepsBack(n => n + 1)}
                    style={{ alignSelf: 'flex-start' }}>
                    힌트 보기 · {HINT_LABEL[easedLevel(level, 1)]}
                  </LBtn>
                )}
                {!result && usedHint && (
                  <div style={{ fontSize: `calc(${t.type.helper}px * var(--fz, 1))`, color: t.neutrals.subtle }}>
                    힌트를 봤으므로 이번 시도는 합격으로 세지 않습니다.
                  </div>
                )}

                {/* 채점 뒤에는 전체 문장을 늘 보여 준다 — 단계와 무관하게 답을 맞춰 볼 자리가 필요하다. */}
                {(result || level === HINT_CHUNKS) && (
                  <div style={{
                    fontSize: `calc(${t.type.helper}px * var(--fz, 1))`, color: t.neutrals.subtle, lineHeight: 1.5,
                    marginTop: t.density.gapSm, padding: `0 ${t.density.tableRowPadX}px`,
                  }}>
                    전체 문장: {current.korean_full}
                  </div>
                )}

                {/* 채점 결과 — 힌트 바로 아래. 왼쪽에서 읽고 오른쪽에서 고쳐 쓴다. */}
                {result && (
                  <div style={{
                    display: 'flex', flexDirection: 'column', gap: t.density.gapMd,
                    paddingTop: t.density.blockGap, borderTop: `1px solid ${t.neutrals.line}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: t.density.gapMd }}>
                      <span style={{
                        fontSize: `calc(${t.type.display}px * var(--fz, 1))`, fontWeight: t.weight.bold, fontFamily: t.font.mono,
                        color: result.passed ? t.accent.pos : t.accent.neg,
                      }}>{result.score}</span>
                      <LBadge tone={result.passed ? 'pos' : 'neg'} pill>
                        {result.passed ? '합격' : result.scored ? '힌트 사용 · 합격 아님' : '재도전 대상'}
                      </LBadge>
                      {/* 없으면 "다시 풀어 90점인데 왜 정답률이 그대로지?"가 된다 */}
                      {result.recorded === false && <LBadge tone="neutral" pill>연습 · 기록 안 됨</LBadge>}
                      <div style={{ marginLeft: 'auto' }}>
                        <LBtn size="sm" onClick={toVoiceCards} disabled={vcState !== 'idle'}>
                          {vcState === 'done' ? '보이스카드 담김 ✓' : vcState === 'sending' ? '담는 중…' : '보이스카드 담기'}
                        </LBtn>
                      </div>
                    </div>

                    {result.points.length > 0 && (
                      <div style={{ display: 'grid', gap: t.density.gapSm }}>
                        {result.points.map((pt, i) => (
                          <div key={i} style={{ display: 'flex', gap: t.density.gapSm, alignItems: 'baseline' }}>
                            <LBadge tone={POINT_TONE[pt.type] ?? 'neutral'}>{POINT_LABEL[pt.type] ?? pt.type}</LBadge>
                            <span style={{ fontSize: `calc(${t.type.body}px * var(--fz, 1))`, lineHeight: 1.5 }}>{pt.note}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ display: 'grid', gap: t.density.gapSm }}>
                      {result.transcript && <ResultLine label="인식된 손글씨" text={result.transcript} />}
                      <ResultLine label="내 문장 다듬기" text={result.corrected} against={result.transcript ?? answer} />
                      <div ref={nativeRef}>
                        <ResultLine label="네이티브 버전" text={result.natural} highlight />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ── 오른쪽: 쓰는 자리 ────────────────────────────────── */}
              <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: t.density.gapSm }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: t.density.gapSm, flexWrap: 'wrap' }}>
                  <LSegmented<'draw' | 'type'>
                    value={inputMode}
                    onChange={(v) => { if (v === 'draw') dictation.stop(); setInputMode(v); setError(null) }}
                    options={[
                      { value: 'draw', label: '손글씨' },
                      { value: 'type', label: '키보드' },
                    ]}
                  />
                  {inputMode === 'type' && !result && dictation.supported && (
                    <div style={{ display: 'flex', gap: t.density.gapSm, alignItems: 'center' }}>
                      {dictation.listening && (
                        <span style={{ fontSize: t.type.control, color: t.accent.neg }}>● 듣는 중</span>
                      )}
                      <LBtn
                        size="sm"
                        variant={dictation.listening ? 'danger' : 'secondary'}
                        disabled={grading}
                        onClick={() => { setError(null); dictation.toggle() }}
                      >
                        {dictation.listening ? '중지' : '말하기'}
                      </LBtn>
                    </div>
                  )}
                </div>

                {inputMode === 'draw' ? (
                  <>
                    {/* 도구 바 — 문서함 연습장과 같은 아이콘 바. 좁으면 판 밖 한 줄로,
                        넓으면 판 위에 띄워 쓰는 자리를 뺏지 않는다. */}
                    {tools.docked && (
                      <DrawTools
                        toolsRef={tools.toolsRef}
                        tool={tool} onToolChange={setTool}
                        onUndo={() => { padRef.current?.undo(); syncTools() }}
                        onRedo={() => { padRef.current?.redo(); syncTools() }}
                        onClear={() => { padRef.current?.clear(); syncTools() }}
                        canUndo={hasInk} canRedo={canRedo}
                        docked={tools.docked} onToggleDock={tools.toggleDock}
                        place={tools.place} handleProps={tools.handleProps}
                      />
                    )}
                    <div ref={tools.boxRef} style={{ position: 'relative' }}>
                      {!tools.docked && (
                        <DrawTools
                          toolsRef={tools.toolsRef}
                          tool={tool} onToolChange={setTool}
                          onUndo={() => { padRef.current?.undo(); syncTools() }}
                          onRedo={() => { padRef.current?.redo(); syncTools() }}
                          onClear={() => { padRef.current?.clear(); syncTools() }}
                          canUndo={hasInk} canRedo={canRedo}
                          docked={tools.docked} onToggleDock={tools.toggleDock}
                          place={tools.place} handleProps={tools.handleProps}
                        />
                      )}
                      <DrawPad
                        ref={padRef}
                        disabled={!!result || grading}
                        height={mobile ? 220 : 260}
                        storageKey="english-practice-h"
                        tool={tool}
                        onInkChange={syncTools}
                      />
                    </div>
                  </>
                ) : (
                  <textarea
                    ref={taRef}
                    value={answer}
                    onChange={e => setAnswer(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder={mobile ? '영어로 써보세요…' : '영어로 써보세요… (⌘+Enter 채점)'}
                    rows={6}
                    disabled={!!result || grading}
                    autoFocus={!mobile}
                    style={{
                      width: '100%', boxSizing: 'border-box', resize: 'vertical',
                      background: t.neutrals.card, border: `1px solid ${t.neutrals.line}`, borderRadius: t.radius.md,
                      padding: `${t.density.gapMd}px ${mobile ? t.density.gapMd : t.density.gapLg}px`,
                      // 16px 미만이면 iOS Safari가 포커스 시 강제 줌 — 16 고정
                      fontSize: `calc(${t.type.body}px * var(--fz, 1))`, lineHeight: 1.5, fontFamily: t.font.sans, color: t.neutrals.text,
                    }}
                  />
                )}

                {/* 아직 확정되지 않은 인식분. 다음 이벤트에서 통째로 갈리는 값이라
                    입력창에 넣지 않고 여기서만 흐리게 보여준다. */}
                {inputMode === 'type' && dictation.listening && dictation.interim && (
                  <div style={{
                    fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, lineHeight: 1.5,
                    color: t.neutrals.subtle, fontStyle: 'italic',
                  }}>
                    {dictation.interim}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: t.density.gapSm, marginTop: t.density.gapXs }}>
                  {!result ? (
                    <LBtn variant="brand" onClick={grade}
                      disabled={(inputMode === 'draw' ? !hasInk : !answer.trim()) || grading}
                      style={mobile ? { flex: 1, justifyContent: 'center' } : undefined}>
                      {grading ? '채점 중…' : inputMode === 'draw' || mobile ? '채점' : '채점 (⌘↵)'}
                    </LBtn>
                  ) : (
                    <>
                      <LBtn variant="secondary" onClick={retry}
                        style={mobile ? { flex: 1, justifyContent: 'center' } : undefined}>
                        다시 풀기
                      </LBtn>
                      <LBtn variant="brand" onClick={next}
                        style={mobile ? { flex: 1, justifyContent: 'center' } : undefined}>
                        {mobile ? '다음 문제' : '다음 문제 (⌘↵)'}
                      </LBtn>
                    </>
                  )}
                </div>

                {/* 채점 뒤 한 번 더 — 답을 옆에 두고 같은 문장을 손으로 다시 써 본다.
                    '다시 풀기'는 점수를 다시 받는 자리라 판을 비우고 답을 감춘다. 이 판은
                    답을 띄운 채로 베껴 쓰는 자리여서 채점에 들어가지 않는다(CEO 2026-09-14). */}
                {result && (
                  <div style={{
                    marginTop: t.density.gapSm + retryGap, paddingTop: t.density.blockGap,
                    borderTop: `1px solid ${t.neutrals.line}`,
                    display: 'flex', flexDirection: 'column', gap: t.density.gapSm,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: t.density.gapSm }}>
                      <span style={{ fontSize: `calc(${t.type.label}px * var(--fz, 1))`, color: t.neutrals.subtle }}>
                        답을 보고 한 번 더 · 채점하지 않아요
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapSm }}>
                        <LSegmented<'draw' | 'type'>
                          value={againMode}
                          onChange={setAgainMode}
                          options={[
                            { value: 'draw', label: '손글씨' },
                            { value: 'type', label: '키보드' },
                          ]}
                        />
                        {((againMode === 'draw' && againInk) || (againMode === 'type' && againText)) && (
                          <LBtn size="sm" variant="ghost" onClick={() => {
                            if (againMode === 'draw') { againRef.current?.clear(); syncAgain() }
                            else setAgainText('')
                          }}>
                            지우기
                          </LBtn>
                        )}
                      </div>
                    </div>
                    <div ref={retryInputRef}>
                    {againMode === 'type' ? (
                      <textarea
                        value={againText}
                        onChange={e => setAgainText(e.target.value)}
                        placeholder="답을 보고 다시 써보세요…"
                        rows={4}
                        style={{
                          width: '100%', boxSizing: 'border-box', resize: 'vertical',
                          background: t.neutrals.card, border: `1px solid ${t.neutrals.line}`, borderRadius: t.radius.md,
                          padding: `${t.density.gapMd}px ${mobile ? t.density.gapMd : t.density.gapLg}px`,
                          fontSize: `calc(${t.type.body}px * var(--fz, 1))`, lineHeight: 1.5,
                          fontFamily: t.font.sans, color: t.neutrals.text,
                        }}
                      />
                    ) : (
                    <>
                    {againTools.docked && (
                      <DrawTools
                        toolsRef={againTools.toolsRef}
                        tool={againTool} onToolChange={setAgainTool}
                        onUndo={() => { againRef.current?.undo(); syncAgain() }}
                        onRedo={() => { againRef.current?.redo(); syncAgain() }}
                        onClear={() => { againRef.current?.clear(); syncAgain() }}
                        canUndo={againInk} canRedo={againRedo}
                        docked={againTools.docked} onToggleDock={againTools.toggleDock}
                        place={againTools.place} handleProps={againTools.handleProps}
                      />
                    )}
                    <div ref={againTools.boxRef} style={{ position: 'relative' }}>
                      {!againTools.docked && (
                        <DrawTools
                          toolsRef={againTools.toolsRef}
                          tool={againTool} onToolChange={setAgainTool}
                          onUndo={() => { againRef.current?.undo(); syncAgain() }}
                          onRedo={() => { againRef.current?.redo(); syncAgain() }}
                          onClear={() => { againRef.current?.clear(); syncAgain() }}
                          canUndo={againInk} canRedo={againRedo}
                          docked={againTools.docked} onToggleDock={againTools.toggleDock}
                          place={againTools.place} handleProps={againTools.handleProps}
                        />
                      )}
                      <DrawPad
                        ref={againRef}
                        height={mobile ? 200 : 220}
                        storageKey="english-practice-again-h"
                        tool={againTool}
                        onInkChange={syncAgain}
                      />
                    </div>
                    </>
                    )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </LCard>
        </>
      )}
    </div>
  )
}

/**
 * 채점이 돌려준 문장 한 줄.
 *
 * 예전에는 회색 판 위에 얹고 네이티브 버전만 생 하늘색(#ECF6FB)을 깔았다. 카드가 테마를
 * 두르면서 판은 벗겨지므로, 강조는 색면이 아니라 선으로 한다 — 이 카드에서 색을 갖는 것은
 * 점수와 '좋음' 배지뿐이어야 한다(2026-09-14).
 *
 * 왼쪽만 두껍게 긋던 것을 상자 전체의 얇은 선으로 바꿨다(CEO 2026-09-14). 한쪽만 굵으면
 * 인용처럼 읽히는데, 이건 인용이 아니라 따로 봐 둘 상자다.
 */
function ResultLine({ label, text, highlight, against }: {
  label: string; text: string; highlight?: boolean
  /** 주면 이 글과 견줘 바뀐 낱말에 배경을 깐다 (스크립타 교정 표시와 같은 방식). */
  against?: string
}) {
  if (!text) return null
  const parts = against ? correctionDiff(against, text) : null
  return (
    <div data-panel="" style={{
      background: t.neutrals.inner,
      borderRadius: t.radius.md, padding: `${t.density.gapSm}px ${t.density.gapLg}px`,
      ...(highlight ? { border: `1px solid ${t.neutrals.line}` } : {}),
    }}>
      <div data-panel-title="" style={{
        fontSize: `calc(${t.type.tableHead}px * var(--fz, 1))`, fontWeight: t.weight.semibold, letterSpacing: 0.8,
        textTransform: 'uppercase', color: t.neutrals.subtle, fontFamily: t.font.mono,
        marginBottom: t.density.tableRowGap,
      }}>{label}</div>
      <div style={{ fontSize: `calc(${t.type.body}px * var(--fz, 1))`, lineHeight: 1.55 }}>
        {parts
          ? parts.map((part, i) => part.changed
              ? (
                // 바뀐 자리에만 배경. 부호라서 색을 쓴다 — 무엇이 고쳐졌는지가 이 줄의 전부다.
                <mark key={i} style={{
                  background: '#DAEEDD', color: '#1F5F3D',
                  borderRadius: 3, padding: '0 2px',
                }}>{part.text}</mark>
              )
              : <span key={i}>{part.text}</span>)
          : text}
      </div>
    </div>
  )
}
