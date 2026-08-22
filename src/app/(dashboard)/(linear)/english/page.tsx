'use client'

// 영작 연습 — 업무위키/이메일 소재의 한글 청킹(영어어순) 문제를 보고 영어로 쓰면 AI가 즉시 채점.
// 목표: 누적 학습 문장을 늘리고, 마지막 시도 기준 정답률을 100%에 가깝게.

import { useState, useEffect, useCallback, useRef } from 'react'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LStat } from '@/app/(dashboard)/_components/linear-stat'
import { LBtn } from '@/app/(dashboard)/_components/linear-btn'
import { LBadge } from '@/app/(dashboard)/_components/linear-badge'
import { LSegmented } from '@/app/(dashboard)/_components/linear-segmented'
import { LSectionHead, LHeadBtn } from '@/app/(dashboard)/_components/linear-section-head'

type Mode = 'new_heavy' | 'balanced' | 'review_heavy'

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
}

const POINT_TONE: Record<string, 'danger' | 'warn' | 'info' | 'pos'> = {
  grammar: 'danger', word: 'warn', natural: 'info', good: 'pos',
}
const POINT_LABEL: Record<string, string> = {
  grammar: '문법', word: '단어', natural: '자연스러움', good: '좋음',
}

export default function EnglishPage() {
  const mobile = useIsMobile()
  const [mode, setMode] = useState<Mode>('balanced')
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
  const taRef = useRef<HTMLTextAreaElement | null>(null)
  const generatingRef = useRef(false)
  // 자동 충전이 실패했을 때 무한 재시도 방지 — 수동 생성 버튼을 누르면 해제
  const autoRefillBlockedRef = useRef(false)

  const loadQueue = useCallback(async (m: Mode) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/english/queue?mode=${m}`)
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
  }, [])

  useEffect(() => { loadQueue(mode) }, [loadQueue, mode])

  const current = queue[idx] ?? null

  const grade = useCallback(async () => {
    if (!current || !answer.trim() || grading || result) return
    setGrading(true)
    setError(null)
    try {
      const res = await fetch('/api/english/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: current.id, answer, isReview: current.is_review }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `grade ${res.status}`)
      setResult(data)
      // 로컬 통계 갱신 — 다음 큐 로드 때 서버값으로 재동기화됨
      setStats(prev => {
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
  }, [current, answer, grading, result])

  const next = useCallback(() => {
    setAnswer('')
    setResult(null)
    setVcState('idle')
    setIdx(i => i + 1)
    setTimeout(() => taRef.current?.focus(), 0)
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
        body: JSON.stringify({ count: 50 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `generate ${res.status}`)
      // 문제은행이 늘었으니 남은 문제 수만 즉시 반영
      setStats(prev => prev ? { ...prev, totalItems: prev.totalItems + data.created, freshRemaining: prev.freshRemaining + data.created } : prev)
      if (opts?.reloadIfEmpty) loadQueue(mode)
    } catch (e) {
      if (opts?.silent) autoRefillBlockedRef.current = true
      else setError(e instanceof Error ? e.message : '문제 생성 실패')
    } finally {
      generatingRef.current = false
      setGenerating(false)
    }
  }, [loadQueue, mode])

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
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <LSectionHead
        title="영작 연습"
        meta="업무위키·이메일 소재 · 미국식 구어체"
        note="한글 청킹(영어어순)을 보고 영어로 쓰면 AI가 즉시 채점 · 합격 80점"
        tools={
          <LSegmented<Mode>
            value={mode}
            onChange={setMode}
            options={[
              { value: 'new_heavy', label: '신규 위주' },
              { value: 'balanced', label: '균형' },
              { value: 'review_heavy', label: '복습 위주' },
            ]}
          />
        }
        action={<LHeadBtn icon="sparkles" label="문제 생성" title="위키·이메일에서 새 문제 50개 생성" onClick={() => { autoRefillBlockedRef.current = false; generate() }} busy={generating} />}
      />

      {/* 지표 — 오늘 학습량 / 누적 문장 / 정답률 / 남은 문제 */}
      <div style={{
        display: 'grid', gap: t.density.kpiGap, marginBottom: t.density.blockGap,
        gridTemplateColumns: mobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(4, minmax(0,1fr))',
      }}>
        <LStat
          label="오늘 학습"
          value={stats ? String(stats.today.fresh + stats.today.review) : '–'}
          unit="/ 100"
          tone={stats && stats.today.fresh + stats.today.review >= 100 ? 'pos' : 'default'}
          sub={stats ? `신규 ${stats.today.fresh} · 복습 ${stats.today.review}` : ''}
          sparkline={sparkTotal}
          sparkline2={sparkReview}
          title="오늘 채점받은 문장 수 (KST) — 목표 하루 100문장. 스파크라인: 최근 7일 (점선=복습)"
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

      {error && (
        <LCard style={{ marginBottom: t.density.blockGap }}>
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
                  : '문제 생성 버튼으로 위키·이메일에서 새 문장 50개를 만드세요.'}
            </div>
            <div style={{ display: 'flex', gap: t.density.gapSm, justifyContent: 'center' }}>
              <LBtn variant="brand" onClick={() => loadQueue(mode)}>새 큐 받기</LBtn>
              {queue.length === 0 && !generating && (
                <LBtn onClick={() => { autoRefillBlockedRef.current = false; generate({ reloadIfEmpty: true }) }}>문제 생성</LBtn>
              )}
            </div>
          </div>
        </LCard>
      ) : (
        <>
          {/* 문제 카드 */}
          <LCard style={{ marginBottom: t.density.blockGap }}>
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
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: t.density.gapSm, marginTop: t.density.gapMd }}>
              {!result ? (
                <LBtn variant="brand" onClick={grade} disabled={!answer.trim() || grading}
                  style={mobile ? { flex: 1, justifyContent: 'center' } : undefined}>
                  {grading ? '채점 중…' : mobile ? '채점' : '채점 (⌘↵)'}
                </LBtn>
              ) : (
                <LBtn variant="brand" onClick={next}
                  style={mobile ? { flex: 1, justifyContent: 'center' } : undefined}>
                  {mobile ? '다음 문제' : '다음 문제 (⌘↵)'}
                </LBtn>
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
