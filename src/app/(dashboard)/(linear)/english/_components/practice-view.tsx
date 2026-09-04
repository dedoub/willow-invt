'use client'

// 영작 연습 — 업무위키/이메일 소재의 한글 청킹(영어어순) 문제를 보고 영어로 쓰면 AI가 즉시 채점.
// 목표: 누적 학습 문장을 늘리고, 마지막 시도 기준 정답률을 100%에 가깝게.

import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LStat } from '@/app/(dashboard)/_components/linear-stat'
import { LBtn } from '@/app/(dashboard)/_components/linear-btn'
import { LBadge } from '@/app/(dashboard)/_components/linear-badge'
import { LSegmented } from '@/app/(dashboard)/_components/linear-segmented'
import { LSectionHead, LHeadBtn } from '@/app/(dashboard)/_components/linear-section-head'
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
  profile: 'ceo' | 'ryuha'
  eyebrow: string
  title: string
  meta: string
  note: string
  /** 오늘 목표 문장 수 (지표 카드의 /N 표기) */
  dailyGoal: number
  /** 문제 소재를 설명하는 짧은 라벨 — 빈 상태·버튼 툴팁 문구에 쓰인다 (예: "위키·이메일", "류하 노트") */
  sourceLabel: string
}

interface QueueItem {
  id: string
  korean_full: string
  korean_chunks: string[]
  reference_english: string
  topic: string | null
  is_review: boolean
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
}

const POINT_TONE: Record<string, 'danger' | 'warn' | 'info' | 'pos'> = {
  grammar: 'danger', word: 'warn', natural: 'info', good: 'pos', meaning: 'danger',
}
const POINT_LABEL: Record<string, string> = {
  grammar: '문법', word: '단어', natural: '자연스러움', good: '좋음', meaning: '의미',
}

export function PracticeView({ profile, eyebrow, title, meta, note, dailyGoal, sourceLabel }: PracticeViewProps) {
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
  const [inputMode, setInputMode] = useState<'type' | 'draw'>(profile === 'ceo' ? 'type' : 'draw')
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen')
  const [hasInk, setHasInk] = useState(false)
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

  const grade = useCallback(async () => {
    if (!current || grading || result) return
    // 채점에 들어가면 더 받아쓸 이유가 없다. 결과 화면에서 마이크가 켜져 있으면
    // 다음 문항 답이 이전 답에 붙는다.
    dictation.stop()
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
            ? { itemId: current.id, imageBase64, isReview: current.is_review, profile, record: !retrying }
            : { itemId: current.id, answer, isReview: current.is_review, profile, record: !retrying },
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
  }, [current, answer, grading, result, profile, inputMode, dictation, retrying])

  const next = useCallback(() => {
    dictation.stop()
    setRetrying(false)
    setAnswer('')
    setResult(null)
    setVcState('idle')
    padRef.current?.clear()
    setHasInk(false)
    setTool('pen')
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
    padRef.current?.clear()
    setHasInk(false)
    if (!mobile) setTimeout(() => taRef.current?.focus(), 0)
  }, [mobile, dictation])

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
    <div style={{
      maxWidth: 860, margin: '0 auto', wordBreak: 'keep-all',
      display: 'flex', flexDirection: 'column', gap: t.density.blockGap,
    }}>
      {/* 섹션 카드 — 다른 페이지 위계와 동일: 카드 안에 헤더(eyebrow)+지표 */}
      <LCard pad={0}>
        <div style={{ padding: t.density.cardPad }}>
          <LSectionHead
            eyebrow={eyebrow}
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
                    background: t.neutrals.inner,
                    color: t.neutrals.muted,
                    border: 'none',
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

          {/* 안내문 — 탭(모드) 줄과 분리해 헤더 아래 한 줄로 (3개 프로필 공통 위치) */}
          <div style={{
            fontSize: 'calc(9.5px * var(--fz, 1))', color: t.neutrals.subtle,
            lineHeight: 1.5, marginBottom: t.density.gapMd,
          }}>{note}</div>

          {/* 지표 — 오늘 학습량 / 누적 문장 / 정답률 / 남은 문제 */}
          <div style={{
            display: 'grid', gap: t.density.kpiGap,
            gridTemplateColumns: mobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(4, minmax(0,1fr))',
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
          <span style={{ fontSize: 'calc(13px * var(--fz, 1))', color: t.accent.neg }}>{error}</span>
        </LCard>
      )}

      {loading ? (
        <LCard>
          <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.neutrals.subtle, fontSize: 'calc(13px * var(--fz, 1))' }}>
            문제 불러오는 중…
          </div>
        </LCard>
      ) : !current ? (
        <LCard>
          <div style={{ padding: '32px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 'calc(15px * var(--fz, 1))', fontWeight: t.weight.semibold, marginBottom: t.density.gapSm }}>
              {queue.length > 0 ? '이번 큐 완료 🎉' : '풀 문제가 없습니다'}
            </div>
            <div style={{ fontSize: 'calc(13px * var(--fz, 1))', color: t.neutrals.muted, marginBottom: t.density.gapLg }}>
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
          {/* 문제 카드 */}
          <LCard>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: t.density.gapMd }}>
              <div style={{ display: 'flex', gap: t.density.gapSm, alignItems: 'center' }}>
                <LBadge tone={current.is_review ? 'warn' : 'brand'} pill>
                  {current.is_review ? '복습' : '신규'}
                </LBadge>
                {current.topic && <LBadge tone="neutral">{current.topic}</LBadge>}
              </div>
              <span style={{ fontSize: 'calc(9.5px * var(--fz, 1))', color: t.neutrals.subtle, fontFamily: t.font.mono }}>
                {idx + 1} / {queue.length}
              </span>
            </div>

            {/* 한글 청킹 — 영어어순, 줄 단위 */}
            <div style={{
              background: t.neutrals.inner, borderRadius: t.radius.md,
              padding: `${t.density.gapMd}px ${t.density.gapLg}px`, marginBottom: t.density.gapMd,
            }}>
              {current.korean_chunks.map((chunk, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'baseline', gap: t.density.gapMd,
                  padding: '3px 0', fontSize: 'calc(13px * var(--fz, 1))', lineHeight: 1.5,
                }}>
                  <span style={{
                    fontSize: 'calc(9.5px * var(--fz, 1))', color: t.neutrals.subtle, fontFamily: t.font.mono,
                    minWidth: 14, textAlign: 'right',
                  }}>{i + 1}</span>
                  <span>{chunk}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 'calc(9.5px * var(--fz, 1))', color: t.neutrals.subtle, marginBottom: t.density.gapMd }}>
              전체 문장: {current.korean_full}
            </div>

            {/* 입력 방식 — 모든 프로필에서 손글씨/키보드 전환 가능. 기본값: 류하=손글씨, 아빠=키보드 */}
            {(
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: t.density.gapSm }}>
                <LSegmented<'draw' | 'type'>
                  value={inputMode}
                  onChange={(v) => { if (v === 'draw') dictation.stop(); setInputMode(v); setError(null) }}
                  options={[
                    { value: 'draw', label: '✏️ 손글씨' },
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
                      {dictation.listening ? '🎤 중지' : '🎤 말하기'}
                    </LBtn>
                  </div>
                )}
                {inputMode === 'draw' && !result && (
                  <div style={{ display: 'flex', gap: t.density.gapSm, alignItems: 'center', flexWrap: 'wrap' }}>
                    <LSegmented<'pen' | 'eraser'>
                      value={tool}
                      onChange={setTool}
                      options={[
                        { value: 'pen', label: '펜' },
                        { value: 'eraser', label: '지우개' },
                      ]}
                    />
                    <LBtn size="sm" variant="secondary" onClick={() => { padRef.current?.undo(); setHasInk(!padRef.current?.isEmpty()) }}>한 획 취소</LBtn>
                    <LBtn size="sm" variant="secondary" onClick={() => { padRef.current?.clear(); setHasInk(false) }}>전체 지우기</LBtn>
                  </div>
                )}
              </div>
            )}

            {inputMode === 'draw' ? (
              <DrawPad
                ref={padRef}
                disabled={!!result || grading}
                height={mobile ? 220 : 260}
                tool={tool}
                onInkChange={setHasInk}
              />
            ) : (
              <textarea
                ref={taRef}
                value={answer}
                onChange={e => setAnswer(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={mobile ? '영어로 써보세요…' : '영어로 써보세요… (⌘+Enter 채점)'}
                rows={3}
                disabled={!!result || grading}
                autoFocus={!mobile}
                style={{
                  width: '100%', boxSizing: 'border-box', resize: 'vertical',
                  background: result ? t.neutrals.page : t.neutrals.inner,
                  border: 'none', borderRadius: t.radius.md,
                  padding: `${t.density.gapMd}px ${mobile ? t.density.gapMd : t.density.gapLg}px`,
                  // 16px 미만이면 iOS Safari가 포커스 시 강제 줌 — 16 고정
                  fontSize: 'calc(13px * var(--fz, 1))', lineHeight: 1.5, fontFamily: t.font.sans, color: t.neutrals.text,
                }}
              />
            )}

            {/* 아직 확정되지 않은 인식분. 다음 이벤트에서 통째로 갈리는 값이라
                입력창에 넣지 않고 여기서만 흐리게 보여준다. */}
            {inputMode === 'type' && dictation.listening && dictation.interim && (
              <div style={{
                marginTop: t.density.gapSm,
                fontSize: 'calc(12px * var(--fz, 1))',
                lineHeight: 1.5,
                color: t.neutrals.subtle,
                fontStyle: 'italic',
              }}>
                {dictation.interim}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: t.density.gapSm, marginTop: t.density.gapMd }}>
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
          </LCard>

          {/* 채점 결과 */}
          {result && (
            <LCard>
              {/* 좁은 화면에서 배지+버튼이 넘치면 버튼이 다음 줄로 내려간다 */}
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: t.density.gapMd, marginBottom: t.density.gapMd }}>
                <span style={{
                  fontSize: 'calc(22px * var(--fz, 1))', fontWeight: t.weight.bold, fontFamily: t.font.mono,
                  color: result.passed ? t.accent.pos : t.accent.neg,
                }}>{result.score}</span>
                <LBadge tone={result.passed ? 'pos' : 'neg'} pill>{result.passed ? '합격' : '재도전 대상'}</LBadge>
                {/* 없으면 "다시 풀어 90점인데 왜 정답률이 그대로지?"가 된다 */}
                {result.recorded === false && <LBadge tone="neutral" pill>연습 · 기록 안 됨</LBadge>}
                <div style={{ marginLeft: 'auto' }}>
                  <LBtn size="sm" onClick={toVoiceCards} disabled={vcState !== 'idle'}>
                    {vcState === 'done' ? '보이스카드 담김 ✓' : vcState === 'sending' ? '담는 중…' : '보이스카드 담기'}
                  </LBtn>
                </div>
              </div>

              <div style={{ display: 'grid', gap: t.density.gapSm, marginBottom: t.density.gapMd }}>
                {result.points.map((p, i) => (
                  <div key={i} style={{ display: 'flex', gap: t.density.gapSm, alignItems: 'baseline' }}>
                    <LBadge tone={POINT_TONE[p.type] ?? 'neutral'}>{POINT_LABEL[p.type] ?? p.type}</LBadge>
                    <span style={{ fontSize: 'calc(13px * var(--fz, 1))', lineHeight: 1.5 }}>{p.note}</span>
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gap: t.density.gapSm }}>
                {result.transcript && <ResultLine label="인식된 손글씨" text={result.transcript} />}
                <ResultLine label="내 문장 다듬기" text={result.corrected} />
                <ResultLine label="네이티브 버전" text={result.natural} highlight />
              </div>
            </LCard>
          )}
        </>
      )}
    </div>
  )
}

function ResultLine({ label, text, highlight }: { label: string; text: string; highlight?: boolean }) {
  if (!text) return null
  return (
    <div style={{
      background: highlight ? '#ECF6FB' : t.neutrals.inner,
      borderRadius: t.radius.md, padding: `${t.density.gapSm}px ${t.density.gapLg}px`,
    }}>
      <div style={{
        fontSize: 'calc(9px * var(--fz, 1))', fontWeight: t.weight.semibold, letterSpacing: 0.8,
        textTransform: 'uppercase', color: t.neutrals.subtle, fontFamily: t.font.mono,
        marginBottom: 2,
      }}>{label}</div>
      <div style={{ fontSize: 'calc(13px * var(--fz, 1))', lineHeight: 1.55 }}>{text}</div>
    </div>
  )
}


// ─── 손글씨 패드 (펜슬/터치) ─────────────────────────────────────────────
// 류하가 영문 키보드 대신 펜슬로 답을 쓴다. 획 단위 undo, 전체 clear,
// 채점 시 흰 배경 PNG(base64)로 내보내 Gemini 비전이 전사+채점한다.

export interface DrawPadHandle {
  /** 흰 배경 PNG base64 (data: 프리픽스 제외). 빈 패드면 null */
  getImage: () => string | null
  clear: () => void
  undo: () => void
  isEmpty: () => boolean
}

type Stroke = { x: number; y: number }[]

const DEFAULT_PAD_H_KEY = 'english-pad-h'
const PAD_H_MIN = 160
const PAD_H_MAX = 1200

export const DrawPad = forwardRef<DrawPadHandle, {
  disabled?: boolean
  height: number
  storageKey?: string
  /** pen: 그리기, eraser: 스친 획을 통째로 지우는 개체 지우개 */
  tool?: 'pen' | 'eraser'
  onInkChange?: (hasInk: boolean) => void
}>(function DrawPad({ disabled, height, storageKey = DEFAULT_PAD_H_KEY, tool = 'pen', onInkChange }, ref) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const strokesRef = useRef<Stroke[]>([])
  const drawingRef = useRef(false)
  // 높이 — 긴 답(작문)을 쓸 수 있게 드래그로 조절, 기기별 localStorage 기억
  const [padH, setPadH] = useState<number>(() => {
    if (typeof window === 'undefined') return height
    const v = Number(localStorage.getItem(storageKey))
    return v >= PAD_H_MIN && v <= PAD_H_MAX ? v : height
  })
  const gripStart = useRef<{ y: number; h: number } | null>(null)

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = t.neutrals.text
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const stroke of strokesRef.current) {
      if (stroke.length < 2) continue
      ctx.beginPath()
      ctx.moveTo(stroke[0].x, stroke[0].y)
      for (let i = 1; i < stroke.length; i++) ctx.lineTo(stroke[i].x, stroke[i].y)
      ctx.stroke()
    }
  }, [])

  // 캔버스 실측 크기 세팅 (dpr 반영) — 리사이즈 시 기존 획 유지한 채 재도장
  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const size = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = wrap.clientWidth * dpr
      canvas.height = padH * dpr
      canvas.style.width = '100%'
      canvas.style.height = `${padH}px`
      redraw()
    }
    size()
    const ro = new ResizeObserver(size)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [padH, redraw])

  useImperativeHandle(ref, () => ({
    getImage: () => {
      const canvas = canvasRef.current
      if (!canvas || strokesRef.current.length === 0) return null
      // 흰 배경 합성 — 투명 PNG는 모델이 읽기 어렵다
      const out = document.createElement('canvas')
      out.width = canvas.width
      out.height = canvas.height
      const ctx = out.getContext('2d')!
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, out.width, out.height)
      ctx.drawImage(canvas, 0, 0)
      return out.toDataURL('image/png').split(',')[1]
    },
    clear: () => { strokesRef.current = []; redraw(); onInkChange?.(false) },
    undo: () => {
      strokesRef.current.pop()
      redraw()
      onInkChange?.(strokesRef.current.length > 0)
    },
    isEmpty: () => strokesRef.current.length === 0,
  }), [redraw, onInkChange])

  const pointFrom = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  // 개체 지우개 — 커서 반경 안에 점이 있는 획을 통째로 제거
  const eraseAt = (p: { x: number; y: number }) => {
    const R = 12
    const before = strokesRef.current.length
    strokesRef.current = strokesRef.current.filter(
      stroke => !stroke.some(q => (q.x - p.x) ** 2 + (q.y - p.y) ** 2 <= R * R),
    )
    if (strokesRef.current.length !== before) {
      redraw()
      onInkChange?.(strokesRef.current.length > 0)
    }
  }

  return (
    <div
      ref={wrapRef}
      style={{
        borderRadius: t.radius.md, overflow: 'hidden',
        background: t.neutrals.inner,
        // 공책 줄 — 아이가 baseline에 맞춰 쓰도록
        backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent 56px, ${t.neutrals.line} 56px, ${t.neutrals.line} 57px)`,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: 'block', touchAction: 'none', cursor: disabled ? 'default' : 'crosshair' }}
        onPointerDown={(e) => {
          if (disabled) return
          e.currentTarget.setPointerCapture(e.pointerId)
          drawingRef.current = true
          if (tool === 'eraser') { eraseAt(pointFrom(e)); return }
          strokesRef.current.push([pointFrom(e)])
        }}
        onPointerMove={(e) => {
          if (!drawingRef.current || disabled) return
          if (tool === 'eraser') { eraseAt(pointFrom(e)); return }
          const stroke = strokesRef.current[strokesRef.current.length - 1]
          stroke.push(pointFrom(e))
          redraw()
        }}
        onPointerUp={() => {
          if (!drawingRef.current) return
          drawingRef.current = false
          onInkChange?.(strokesRef.current.length > 0)
        }}
        onPointerCancel={() => { drawingRef.current = false }}
      />
      {/* 높이 조절 그립 — 드래그로 160~1200px, 기기별 기억 */}
      <div
        title="드래그해서 높이 조절"
        style={{
          height: 18, display: 'grid', placeItems: 'center', cursor: 'ns-resize',
          touchAction: 'none', borderTop: `1px solid ${t.neutrals.line}`, background: t.neutrals.card,
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          gripStart.current = { y: e.clientY, h: padH }
        }}
        onPointerMove={(e) => {
          if (!gripStart.current) return
          const next = Math.max(PAD_H_MIN, Math.min(PAD_H_MAX, Math.round(gripStart.current.h + e.clientY - gripStart.current.y)))
          setPadH(next)
          try { localStorage.setItem(storageKey, String(next)) } catch { /* noop */ }
        }}
        onPointerUp={() => { gripStart.current = null }}
        onPointerCancel={() => { gripStart.current = null }}
      >
        <span style={{ width: 38, height: 4, borderRadius: 999, background: t.neutrals.line }} />
      </div>
    </div>
  )
})
