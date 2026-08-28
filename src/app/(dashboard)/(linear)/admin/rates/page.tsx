'use client'

/**
 * 세 앱의 크레딧 요율을 한 화면에서 본다.
 *
 * 각 앱에도 자기 요율 화면이 있다. 여기는 그걸 대신하는 곳이 아니라 <b>같이
 * 놓고 보는</b> 곳이다 — 세 앱이 같은 판매가를 쓰므로, 한 앱만 보면 다른 앱이
 * 띠 밖으로 나간 걸 놓친다.
 *
 * 저장하면 <b>배포 없이</b> 그 앱의 값매김이 바뀐다. 보이스카드는 다음에 앱을
 * 켤 때부터, 웹 둘은 서버 캐시가 도는 1분 안에.
 */
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useIsAdmin } from '@/lib/auth-context'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { useDashCols } from '@/app/(dashboard)/_components/cols-toggle'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead, LHeadBtn } from '@/app/(dashboard)/_components/linear-section-head'
import { LNotice } from '@/app/(dashboard)/_components/linear-notice'
import { Bone } from '@/app/(dashboard)/_components/linear-skeleton'
import { MARGIN_BAND, MICROS_PER_CREDIT, pct, type RateUnit } from '@/lib/credit-rates-core'

interface Verdict {
  mark: string
  n: number
  basis: 'measured' | 'list' | null
  margin?: number
  worstMargin?: number
  suggested?: number
  note: string
}

interface RateRow {
  key: string
  label: string
  unit: RateUnit
  hint: string
  value: number
  fallback: number
  overridden: boolean
  verdict: Verdict
}

interface AppView {
  key: string
  label: string
  table: string
  costSource: string | null
  rows: RateRow[]
  error: string | null
}

const UNIT_LABEL: Record<RateUnit, string> = {
  credits: '크레딧',
  perCredit: '개당 1크레딧',
  milli: '밀리크레딧',
}

/** 값이 커지면 사용자가 더 내는가, 덜 내는가. 이걸 안 보이면 반대로 고친다. */
const UNIT_DIRECTION: Record<RateUnit, string> = {
  credits: '↑ 올리면 더 받는다',
  perCredit: '↓ 올리면 덜 받는다',
  milli: '↑ 올리면 더 받는다',
}

function marginColor(v: Verdict): string {
  if (v.margin === undefined) return t.neutrals.subtle
  if (v.margin < MARGIN_BAND[0] || v.margin > MARGIN_BAND[1]) return t.accent.neg
  return t.accent.pos
}

export default function RatesPage() {
  const router = useRouter()
  const isAdmin = useIsAdmin()
  const mobile = useIsMobile()
  const cols = useDashCols()

  const [apps, setApps] = useState<AppView[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isAdmin && !loading) router.push('/')
  }, [isAdmin, loading, router])

  const load = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch('/api/credit-rates')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '읽지 못했습니다')
      setApps(data.apps)
      setDrafts({})
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { if (isAdmin) load() }, [isAdmin, load])

  const save = async (app: string, row: RateRow, value: number | null) => {
    const id = `${app}:${row.key}`
    setSaving(id)
    setError(null)
    try {
      const res = await fetch('/api/credit-rates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app, key: row.key, value }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '바꾸지 못했습니다')
      setApps(data.apps)
      setDrafts((prev) => { const next = { ...prev }; delete next[id]; return next })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(null)
    }
  }

  if (!isAdmin) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: t.density.blockGap }}>
      <LCard>
        <LSectionHead
          eyebrow="CREDITS"
          title="AI 크레딧"
          meta={`판매가 크레딧당 $${(MICROS_PER_CREDIT / 1_000_000).toFixed(4)} · 목표 마진 ${MARGIN_BAND[0] * 100}~${MARGIN_BAND[1] * 100}%`}
          note="저장하면 배포 없이 그 앱에 바로 걸린다"
          action={<LHeadBtn icon="refresh" title="다시 읽기" onClick={load} busy={refreshing} />}
        />
        <div style={{ fontSize: `calc(${t.type.helper}px * var(--fz, 1))`, color: t.neutrals.muted, lineHeight: 1.6, wordBreak: 'keep-all' }}>
          세 앱이 같은 판매가를 쓴다. 값을 비우고 저장하면 그 앱 코드의 기본값으로 돌아간다 —
          같은 수를 적어 두는 것과 다르다(코드가 바뀌어도 DB 값이 앱을 옛 값에 묶는다).
        </div>
      </LCard>

      {error && <LNotice tone="danger" text={error} />}

      {/* 앱 카드만 2열로 눕는다. 머리말과 오류는 폭을 다 쓰는 편이 읽기 쉽다.
          뼈대도 같은 그리드 안에 둔다 — 밖에 두면 로딩이 끝나는 순간 1열에서
          2열로 접히며 화면이 튄다. */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: cols === 2 && !mobile ? 'minmax(0,1fr) minmax(0,1fr)' : '1fr',
        gap: t.density.blockGap, alignItems: 'start',
      }}>
      {/* 첫 조회만 뼈대를 세운다. 다시 읽기는 이미 있는 표를 두고 헤더만 돈다. */}
      {loading && apps.length === 0 && <RatesSkeleton />}

      {apps.map((app) => (
        <LCard key={app.key}>
          <LSectionHead
            eyebrow="RATES"
            title={app.label}
            meta={app.costSource ? `실측 ${app.costSource}` : '실측 없음 — 공급가 정가로 판정'}
            note={app.table}
          />
          {app.error && <LNotice tone="danger" text={app.error} />}
          <div style={{ display: 'flex', flexDirection: 'column', gap: t.density.gapSm }}>
            {app.rows.map((row) => {
              const id = `${app.key}:${row.key}`
              const draft = drafts[id]
              const dirty = draft !== undefined && draft !== String(row.value)
              const parsed = draft === undefined ? row.value : Number(draft)
              const valid = Number.isInteger(parsed) && parsed > 0
              return (
                <div key={row.key} style={{
                  display: 'grid',
                  gridTemplateColumns: mobile ? '1fr' : 'minmax(0,1.4fr) auto minmax(0,1.3fr)',
                  gap: t.density.gapMd,
                  alignItems: 'center',
                  // 줄마다 선을 긋지 않는다. 행은 내부 패널 면으로 구분한다.
                  background: t.neutrals.inner,
                  borderRadius: t.radius.sm,
                  padding: `${t.density.panelPadY}px ${t.density.panelPadX}px`,
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: `calc(${t.type.body}px * var(--fz, 1))`, fontWeight: t.weight.medium }}>
                      {row.label}
                      {!row.overridden && (
                        <span style={{ marginLeft: 6, fontSize: `calc(${t.type.helper}px * var(--fz, 1))`, color: t.neutrals.subtle }}>
                          코드 기본값
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: `calc(${t.type.helper}px * var(--fz, 1))`, color: t.neutrals.subtle, lineHeight: 1.5, wordBreak: 'keep-all' }}
                         dangerouslySetInnerHTML={{ __html: row.hint }} />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapSm }}>
                    <input
                      value={draft ?? String(row.value)}
                      inputMode="numeric"
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [id]: e.target.value }))}
                      style={{
                        width: 72, height: t.density.controlHSm, textAlign: 'right',
                        padding: '0 8px', borderRadius: t.radius.sm,
                        border: `1px solid ${dirty && !valid ? t.accent.neg : t.neutrals.line}`,
                        fontFamily: t.font.mono, fontSize: `calc(${t.type.control}px * var(--fz, 1))`,
                        background: t.neutrals.card, color: t.neutrals.text,
                      }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: `calc(${t.type.helper}px * var(--fz, 1))`, color: t.neutrals.muted, whiteSpace: 'nowrap' }}>
                        {UNIT_LABEL[row.unit]}
                      </div>
                      <div style={{ fontSize: `calc(${t.type.helper}px * var(--fz, 1))`, color: t.neutrals.subtle, whiteSpace: 'nowrap' }}>
                        {UNIT_DIRECTION[row.unit]}
                      </div>
                    </div>
                    {dirty && (
                      <button
                        onClick={() => valid && save(app.key, row, parsed)}
                        disabled={!valid || saving === id}
                        style={{
                          height: t.density.controlHSm, padding: '0 10px', border: 'none',
                          borderRadius: t.radius.sm, background: t.brand[600], color: '#fff',
                          fontFamily: t.font.sans, fontSize: `calc(${t.type.control}px * var(--fz, 1))`,
                          cursor: valid ? 'pointer' : 'default', opacity: valid ? 1 : 0.4,
                        }}>
                        저장
                      </button>
                    )}
                    {row.overridden && !dirty && (
                      <button
                        onClick={() => save(app.key, row, null)}
                        disabled={saving === id}
                        title={`코드 기본값(${row.fallback})으로 되돌린다`}
                        style={{
                          height: t.density.controlHSm, padding: '0 10px', border: 'none',
                          borderRadius: t.radius.sm, background: t.neutrals.inner, color: t.neutrals.muted,
                          fontFamily: t.font.sans, fontSize: `calc(${t.type.control}px * var(--fz, 1))`, cursor: 'pointer',
                        }}>
                        되돌리기
                      </button>
                    )}
                  </div>

                  <div style={{ fontSize: `calc(${t.type.helper}px * var(--fz, 1))`, lineHeight: 1.5, minWidth: 0 }}>
                    <span style={{ marginRight: 6 }}>{row.verdict.mark}</span>
                    <span style={{ color: marginColor(row.verdict), fontFamily: t.font.mono }}>
                      {pct(row.verdict.margin)}
                    </span>
                    <span style={{ color: t.neutrals.subtle }}>
                      {row.verdict.worstMargin !== undefined && row.verdict.basis === 'measured' && ` / 최악 ${pct(row.verdict.worstMargin)}`}
                      {row.verdict.basis === 'measured' ? ` · 실측 ${row.verdict.n}건` : row.verdict.basis === 'list' ? ' · 정가 기준' : ''}
                    </span>
                    <div style={{ color: t.neutrals.subtle, wordBreak: 'keep-all' }}>
                      {row.verdict.note}
                      {row.verdict.suggested !== undefined && ` → ${row.verdict.suggested < 10 ? row.verdict.suggested.toFixed(1) : Math.round(row.verdict.suggested)} 제안`}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </LCard>
      ))}
      </div>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
// 앱 카드 셋과 그 안의 요율 행을 실제 배치대로 세운다.

function RatesSkeleton() {
  return (
    <>
      {[0, 1, 2].map(card => (
        <LCard key={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapSm, marginBottom: t.density.gapMd }}>
            <Bone w={92} h={13} />
            <Bone w={140} h={9} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: t.density.gapSm }}>
            {[0, 1, 2].map(row => (
              <div key={row} style={{
                background: t.neutrals.inner, borderRadius: t.radius.sm,
                padding: `${t.density.panelPadY}px ${t.density.panelPadX}px`,
                display: 'flex', alignItems: 'center', gap: t.density.gapMd,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Bone w={80} h={11} style={{ marginBottom: 5 }} />
                  <Bone w={'70%'} h={9} />
                </div>
                <Bone w={72} h={t.density.controlHSm} r={t.radius.sm} />
                <Bone w={96} h={9} />
              </div>
            ))}
          </div>
        </LCard>
      ))}
    </>
  )
}
