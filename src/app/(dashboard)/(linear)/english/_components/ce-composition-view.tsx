'use client'

import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LBadge } from '@/app/(dashboard)/_components/linear-badge'
import { LBtn } from '@/app/(dashboard)/_components/linear-btn'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LStat } from '@/app/(dashboard)/_components/linear-stat'
import { LSegmented } from '@/app/(dashboard)/_components/linear-segmented'
import { DrawPad, type DrawPadHandle } from './practice-view'

interface CeQueueItem {
  id: string
  title: string
  maxScore: number
  imageKeys: string[]
  questionText: string
  solution: string
  isReview: boolean
}

interface CeStats {
  today: number
  attempted: number
  solvedFull: number
  total: number
}

interface CeGradeResult {
  score: number
  maxScore: number
  points: {
    level?: 'paragraph_structure' | 'paragraph_sentence_structure' | 'sentence_quality'
    earned: number
    possible: number
    note: string
    nextPractice?: string
  }[]
  comment: string
  corrections?: { before: string; after: string; why: string }[]
  transcript?: string
}

export function CeCompositionView() {
  const mobile = useIsMobile()
  const [loading, setLoading] = useState(true)
  const [queue, setQueue] = useState<CeQueueItem[]>([])
  const [stats, setStats] = useState<CeStats | null>(null)
  const [idx, setIdx] = useState(0)
  const [answer, setAnswer] = useState('')
  const [inputMode, setInputMode] = useState<'draw' | 'type'>('draw')
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen')
  const [hasInk, setHasInk] = useState(false)
  const [grading, setGrading] = useState(false)
  const [result, setResult] = useState<CeGradeResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const padRef = useRef<DrawPadHandle | null>(null)

  const loadQueue = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/english/ce/queue?kind=composition')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `queue ${res.status}`)
      setQueue(data.queue)
      setStats(data.stats)
      setIdx(0)
      setAnswer('')
      setResult(null)
      padRef.current?.clear()
      setHasInk(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : '기출 작문을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadQueue() }, [loadQueue])

  const current = queue[idx] ?? null

  const grade = useCallback(async () => {
    if (!current || grading || result) return
    const imageBase64 = inputMode === 'draw' ? padRef.current?.getImage() : undefined
    if (inputMode === 'draw' ? !imageBase64 : !answer.trim()) return
    setGrading(true)
    setError(null)
    try {
      const res = await fetch('/api/english/ce/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inputMode === 'draw'
          ? { problemId: current.id, imageBase64 }
          : { problemId: current.id, answer }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `grade ${res.status}`)
      setResult(data)
      setStats(prev => prev ? {
        ...prev,
        today: prev.today + 1,
        attempted: current.isReview ? prev.attempted : prev.attempted + 1,
        solvedFull: data.score >= data.maxScore
          ? prev.solvedFull + 1
          : prev.solvedFull,
      } : prev)
    } catch (e) {
      setError(e instanceof Error ? e.message : '채점하지 못했습니다.')
    } finally {
      setGrading(false)
    }
  }, [answer, current, grading, inputMode, result])

  const next = useCallback(() => {
    setAnswer('')
    setResult(null)
    setTool('pen')
    padRef.current?.clear()
    setHasInk(false)
    setIdx(i => i + 1)
  }, [])

  return (
    <div style={{
      maxWidth: 900,
      margin: '0 auto',
      wordBreak: 'keep-all',
      display: 'flex',
      flexDirection: 'column',
      gap: t.density.blockGap,
    }}>
      <LCard pad={0}>
        <div style={{ padding: t.density.cardPad }}>
          <LSectionHead
            eyebrow="CE 11+ WRITING"
            title="기출 작문"
            meta="ISEB CE AT 11+ English"
          />
          <div style={{
            fontSize: 'calc(9.5px * var(--fz, 1))',
            color: t.neutrals.subtle,
            lineHeight: 1.5,
            marginBottom: t.density.gapMd,
          }}>
            문제를 이해하고 계획한 뒤 씁니다. 문단 구성, 문단 내 문장 구성, 개별 문장의 완성도를 차례로 연습합니다.
          </div>
          <div style={{
            display: 'grid',
            gap: t.density.kpiGap,
            gridTemplateColumns: mobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(4, minmax(0,1fr))',
          }}>
            <LStat label="오늘 작성" value={stats ? String(stats.today) : '-'} unit="편" />
            <LStat label="시도한 기출" value={stats ? String(stats.attempted) : '-'} unit="문제" />
            <LStat label="만점 완료" value={stats ? String(stats.solvedFull) : '-'} unit="문제" tone="pos" />
            <LStat label="전체 기출" value={stats ? String(stats.total) : '-'} unit="문제" />
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
          <div style={{ minHeight: 240, display: 'grid', placeItems: 'center', color: t.neutrals.subtle }}>
            기출 작문을 불러오는 중...
          </div>
        </LCard>
      ) : !current ? (
        <LCard>
          <div style={{ padding: '32px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 'calc(15px * var(--fz, 1))', fontWeight: t.weight.semibold, marginBottom: t.density.gapMd }}>
              이번 기출 작문을 모두 작성했습니다.
            </div>
            <LBtn variant="brand" onClick={loadQueue}>새 기출 받기</LBtn>
          </div>
        </LCard>
      ) : (
        <>
          <LCard>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: t.density.gapMd, marginBottom: t.density.gapMd }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapSm, minWidth: 0 }}>
                <LBadge tone={current.isReview ? 'warn' : 'brand'} pill>
                  {current.isReview ? '다시 쓰기' : '새 기출'}
                </LBadge>
                <span style={{ fontSize: 'calc(13px * var(--fz, 1))', fontWeight: t.weight.semibold }}>
                  {current.title}
                </span>
              </div>
              <span style={{ flexShrink: 0, fontSize: 'calc(9.5px * var(--fz, 1))', color: t.neutrals.subtle, fontFamily: t.font.mono }}>
                {idx + 1} / {queue.length}
              </span>
            </div>

            <div style={{ display: 'grid', gap: t.density.gapSm, marginBottom: t.density.gapMd }}>
              {current.imageKeys.map((key, imageIdx) => (
                <div key={key} style={{ overflow: 'hidden', borderRadius: t.radius.md, background: t.neutrals.inner }}>
                  <Image
                    src={`/api/english/ce/image?key=${encodeURIComponent(key)}`}
                    alt={`${current.title} 문제 ${imageIdx + 1}`}
                    width={1600}
                    height={2200}
                    sizes="(max-width: 768px) 100vw, 860px"
                    unoptimized
                    style={{ width: '100%', height: 'auto', display: 'block' }}
                  />
                </div>
              ))}
              {current.questionText && (
                <div style={{ fontSize: 'calc(13px * var(--fz, 1))', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
                  {current.questionText}
                </div>
              )}
            </div>

            <div style={{
              background: t.neutrals.inner,
              borderRadius: t.radius.md,
              padding: `${t.density.gapMd}px ${mobile ? t.density.gapMd : t.density.gapLg}px`,
              marginBottom: t.density.gapLg,
            }}>
              <div style={{ fontSize: `calc(${t.type.panelTitle}px * var(--fz, 1))`, fontWeight: t.weight.semibold, marginBottom: t.density.gapSm }}>
                문제 풀이
              </div>
              <div style={{ fontSize: 'calc(13px * var(--fz, 1))', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                {current.solution}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: t.density.gapSm, flexWrap: 'wrap', marginBottom: t.density.gapSm }}>
              <LSegmented<'draw' | 'type'>
                value={inputMode}
                onChange={(value) => { setInputMode(value); setError(null) }}
                options={[
                  { value: 'draw', label: '손글씨' },
                  { value: 'type', label: '키보드' },
                ]}
              />
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
                  <LBtn size="sm" variant="secondary" onClick={() => { padRef.current?.undo(); setHasInk(!padRef.current?.isEmpty()) }}>
                    한 획 취소
                  </LBtn>
                  <LBtn size="sm" variant="secondary" onClick={() => { padRef.current?.clear(); setHasInk(false) }}>
                    전체 지우기
                  </LBtn>
                </div>
              )}
            </div>

            {inputMode === 'draw' ? (
              <DrawPad
                ref={padRef}
                disabled={!!result || grading}
                height={mobile ? 380 : 520}
                storageKey="english-ce-pad-h"
                tool={tool}
                onInkChange={setHasInk}
              />
            ) : (
              <textarea
                value={answer}
                onChange={event => setAnswer(event.target.value)}
                placeholder="영어 작문을 써보세요."
                rows={18}
                disabled={!!result || grading}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  resize: 'vertical',
                  background: result ? t.neutrals.page : t.neutrals.inner,
                  border: 'none',
                  borderRadius: t.radius.md,
                  padding: `${t.density.gapMd}px ${mobile ? t.density.gapMd : t.density.gapLg}px`,
                  fontSize: '16px',
                  lineHeight: 1.65,
                  fontFamily: t.font.sans,
                  color: t.neutrals.text,
                }}
              />
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: t.density.gapMd }}>
              {!result ? (
                <LBtn
                  variant="brand"
                  onClick={grade}
                  disabled={(inputMode === 'draw' ? !hasInk : !answer.trim()) || grading}
                  style={mobile ? { width: '100%', justifyContent: 'center' } : undefined}
                >
                  {grading ? '풀이 기준으로 채점 중...' : '채점'}
                </LBtn>
              ) : (
                <LBtn variant="brand" onClick={next} style={mobile ? { width: '100%', justifyContent: 'center' } : undefined}>
                  다음 기출
                </LBtn>
              )}
            </div>
          </LCard>

          {result && <CeGradeCard result={result} />}
        </>
      )}
    </div>
  )
}

function CeGradeCard({ result }: { result: CeGradeResult }) {
  const strong = result.score / result.maxScore >= 0.8
  return (
    <LCard>
      <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapMd, marginBottom: t.density.gapMd }}>
        <span style={{ fontSize: 'calc(22px * var(--fz, 1))', fontWeight: t.weight.bold, fontFamily: t.font.mono, color: strong ? t.accent.pos : t.accent.warn }}>
          {result.score} / {result.maxScore}
        </span>
        <LBadge tone={strong ? 'pos' : 'warn'} pill>{strong ? '잘 썼어요' : '다듬어 볼 부분'}</LBadge>
      </div>

      <div style={{ display: 'grid', gap: t.density.gapSm, marginBottom: t.density.gapMd }}>
        {result.points.map((point, index) => (
          <div key={index} style={{ background: t.neutrals.inner, borderRadius: t.radius.sm, padding: `${t.density.gapSm}px ${t.density.gapMd}px` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: t.density.gapMd, alignItems: 'baseline', marginBottom: 3 }}>
              <span style={{ fontSize: `calc(${t.type.panelTitle}px * var(--fz, 1))`, fontWeight: t.weight.semibold }}>
                {GRADE_LEVEL_LABEL[point.level ?? GRADE_LEVEL_ORDER[index]]}
              </span>
              <span style={{ flexShrink: 0, fontFamily: t.font.mono, fontSize: `calc(${t.type.label}px * var(--fz, 1))`, fontWeight: t.weight.semibold }}>
                {point.earned} / {point.possible}
              </span>
            </div>
            <div style={{ fontSize: 'calc(13px * var(--fz, 1))', lineHeight: 1.55 }}>{point.note}</div>
            {point.nextPractice && (
              <div style={{ color: t.neutrals.muted, fontSize: `calc(${t.type.helper}px * var(--fz, 1))`, lineHeight: 1.5, marginTop: 4 }}>
                다음 연습: {point.nextPractice}
              </div>
            )}
          </div>
        ))}
      </div>

      {result.comment && (
        <div style={{ fontSize: 'calc(13px * var(--fz, 1))', lineHeight: 1.65, marginBottom: t.density.gapMd }}>
          {result.comment}
        </div>
      )}

      {result.transcript && <FeedbackLine label="인식된 손글씨" text={result.transcript} />}
      {result.corrections?.map((correction, index) => (
        <div key={index} style={{ display: 'grid', gap: 3, marginTop: t.density.gapSm }}>
          <FeedbackLine label="쓴 문장" text={correction.before} />
          <FeedbackLine label="다듬은 문장" text={correction.after} highlight />
          <div style={{ paddingLeft: t.density.gapMd, color: t.neutrals.muted, fontSize: `calc(${t.type.helper}px * var(--fz, 1))` }}>
            {correction.why}
          </div>
        </div>
      ))}
    </LCard>
  )
}

const GRADE_LEVEL_ORDER = [
  'paragraph_structure',
  'paragraph_sentence_structure',
  'sentence_quality',
] as const

const GRADE_LEVEL_LABEL: Record<(typeof GRADE_LEVEL_ORDER)[number], string> = {
  paragraph_structure: '1. 문단 구성',
  paragraph_sentence_structure: '2. 문단 내 문장 구성',
  sentence_quality: '3. 개별 문장의 완성도',
}

function FeedbackLine({ label, text, highlight }: { label: string; text: string; highlight?: boolean }) {
  if (!text) return null
  return (
    <div style={{
      background: highlight ? '#ECF6FB' : t.neutrals.inner,
      borderRadius: t.radius.sm,
      padding: `${t.density.gapSm}px ${t.density.gapMd}px`,
    }}>
      <div style={{ fontSize: `calc(${t.type.label}px * var(--fz, 1))`, color: t.neutrals.subtle, fontWeight: t.weight.semibold, marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 'calc(13px * var(--fz, 1))', lineHeight: 1.55 }}>{text}</div>
    </div>
  )
}
