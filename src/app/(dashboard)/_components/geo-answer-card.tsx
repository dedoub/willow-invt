'use client'

// AI 답변 점유 — 검색 수요 포착 섹션의 GEO판.
//
// 검색이 "우리 페이지가 결과에 뜨는가"를 묻는다면 여기는 "답변에 우리가 추천되는가"를 묻는다.
// 지표 순서도 퍼널이다: 언급 → 추천 Top3 → 인용.
// 헤드라인은 인용률이 아니라 **추천 Top3**다. 링크만 인용되고 경쟁사를 추천하는 답변이 흔해서,
// 인용률만 보면 나아지는 것처럼 착각한다.

import { useCallback, useEffect, useState } from 'react'
import { t, tonePalettes } from './linear-tokens'
import { LCard } from './linear-card'
import { LSectionHead } from './linear-section-head'
import { LStat } from './linear-stat'
import { LIcon } from './linear-icons'
import { useDashCols } from './cols-toggle'
import { useIsMobile } from './linear-tokens'
import { DataTable, panelStyle, panelTitle, EmptyLine } from './linear-data-table'
import type { GeoAnswerStats } from '@/lib/geo-answers'

const mono = (size: number): React.CSSProperties => ({
  fontSize: `calc(${size}px * var(--fz, 1))`, fontFamily: t.font.mono,
  fontVariantNumeric: 'tabular-nums' as const,
})

/** 기준선 대비 증감(%p). 첫 측정뿐이면 표시할 게 없다 */
function Delta({ now, base }: { now: number; base: number | null }) {
  if (base == null) return null
  const diff = Math.round((now - base) * 10) / 10
  if (diff === 0) return null
  return (
    <span style={{ ...mono(9.5), marginLeft: 5, fontWeight: 600, color: diff > 0 ? t.accent.pos : t.accent.neg }}>
      {diff > 0 ? '+' : '−'}{Math.abs(diff)}%p
    </span>
  )
}

export function GeoAnswerCard({ site }: { site: 'voicecards' | 'reviewnotes' | 'valuechain' }) {
  const mobile = useIsMobile()
  const dashCols = useDashCols()
  const [data, setData] = useState<GeoAnswerStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/geo/answers?site=${site}&days=90`)
      const json = await res.json()
      if (!res.ok) throw new Error(json?.message || `조회 실패 (${res.status})`)
      setData(json as GeoAnswerStats)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setData(null)
    }
    setLoading(false)
  }, [site])

  useEffect(() => { load() }, [load])

  const splitLayout = !mobile && dashCols === 1
  const panelCols = mobile ? '1fr' : splitLayout ? 'repeat(3, minmax(0,1fr))' : 'repeat(2, minmax(0,1fr))'
  const statCols = mobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)'
  const hasBaseline = !!data?.baselineDay

  return (
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: 12 }}>
        <LSectionHead
          eyebrow="AI ANSWERS"
          title="AI 답변 점유"
          meta={data?.latestDay
            ? `${data.latestDay} 측정 · 질문 ${data.questions.length}개 · ${data.latest.runs}회 실행${hasBaseline ? ` · 기준선 ${data.baselineDay}` : ' · 기준선 회차'}`
            : undefined}
          action={
            <button onClick={load} disabled={loading} title="다시 조회"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                background: t.neutrals.inner, color: t.neutrals.muted, border: 'none',
                borderRadius: t.radius.md, padding: '5px 10px',
                fontSize: 'calc(12px * var(--fz, 1))', cursor: loading ? 'default' : 'pointer',
                fontFamily: t.font.sans, opacity: loading ? 0.5 : 1,
              }}>
              <LIcon name="refresh" size={13} stroke={1.8} />
            </button>
          }
        />

        {error && (
          <div style={{
            padding: '8px 12px', borderRadius: t.radius.md, marginBottom: 10,
            background: tonePalettes.warn.bg, color: tonePalettes.warn.fg,
            fontSize: 'calc(10.5px * var(--fz, 1))', wordBreak: 'keep-all' as const, lineHeight: 1.6,
          }}>
            AI 답변 측정 조회 실패 — {error}
          </div>
        )}

        {!error && !loading && data && data.latest.runs === 0 && (
          <div style={{ ...panelStyle, minHeight: 96 }}>
            <EmptyLine>
              아직 측정 기록이 없습니다<br />
              `node scripts/geo-measure.mjs {site} gemini 3` 으로 기준선을 만드세요
            </EmptyLine>
          </div>
        )}

        {data && data.latest.runs > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: statCols, gap: 8 }}>
              <LStat
                label="추천 Top3"
                value={`${data.latest.top3}%`}
                valueExtra={<Delta now={data.latest.top3} base={hasBaseline ? data.baseline.top3 : null} />}
                sub="답변의 추천 상위 3개 안에 든 비율"
                tone={data.latest.top3 >= 30 ? 'pos' : data.latest.top3 > 0 ? 'warn' : 'default'}
                title="이 섹션의 핵심 지표. 링크만 인용되고 경쟁사가 추천되는 경우가 많아, 인용률보다 이쪽이 실제 점유를 나타낸다."
              />
              <LStat
                label="언급률"
                value={`${data.latest.mentioned}%`}
                valueExtra={<Delta now={data.latest.mentioned} base={hasBaseline ? data.baseline.mentioned : null} />}
                sub="답변 본문에 브랜드가 등장한 비율"
                title="답변이 우리를 알기는 하는가. 언급은 되는데 Top3가 낮으면 인지도가 아니라 설득력 문제다."
              />
              <LStat
                label="인용률"
                value={`${data.latest.cited}%`}
                valueExtra={<Delta now={data.latest.cited} base={hasBaseline ? data.baseline.cited : null} />}
                sub="우리 URL이 출처로 붙은 비율"
                title="출처 목록에 우리 도메인이 들어간 비율. 인용돼도 추천은 경쟁사일 수 있으니 단독으로 읽지 말 것."
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: panelCols, gap: 8, alignItems: 'stretch' }}>
              <DataTable
                title="질문별 성적"
                minWidth={330}
                columns={[
                  { key: 'q', label: '질문', width: 'minmax(140px,1fr)' },
                  { key: 'm', label: '언급', width: '46px', align: 'right' as const },
                  { key: 't', label: 'Top3', width: '46px', align: 'right' as const },
                  { key: 'c', label: '인용', width: '46px', align: 'right' as const },
                ]}
                rows={data.questions.map(q => ({
                  key: q.questionId,
                  cells: [
                    <span key="q" title={q.question} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {q.question}
                    </span>,
                    `${q.mentioned}%`,
                    <span key="t" style={{ color: q.top3 > 0 ? t.neutrals.text : t.accent.neg, fontWeight: 600 }}>{q.top3}%</span>,
                    `${q.cited}%`,
                  ],
                  sort: [q.question, q.mentioned, q.top3, q.cited],
                }))}
                empty="측정된 질문이 없습니다"
              />

              <DataTable
                title="우리가 빠진 자리의 경쟁사"
                minWidth={240}
                columns={[
                  { key: 'name', label: '서비스', width: 'minmax(90px,1fr)' },
                  { key: 'n', label: '답변 수', width: '56px', align: 'right' as const },
                ]}
                rows={data.competitors.map(c => ({
                  key: c.name,
                  cells: [c.name, c.answers.toLocaleString()],
                  sort: [c.name, c.answers],
                }))}
                empty="Top3를 놓친 답변에 잡힌 경쟁사가 없습니다"
              />

              <div style={panelStyle}>
                <div style={{ marginBottom: 6 }}>
                  <div style={panelTitle}>엔진별</div>
                </div>
                {data.byEngine.length === 0 ? (
                  <EmptyLine>측정 엔진이 없습니다</EmptyLine>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {data.byEngine.map(e => (
                      <div key={e.engine} style={{
                        display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', alignItems: 'center', gap: 8,
                        padding: '4px 5px', borderRadius: t.radius.sm, background: t.neutrals.card,
                      }}>
                        <span style={{ fontSize: 'calc(10px * var(--fz, 1))', color: t.neutrals.text }}>{e.engine}</span>
                        <span style={{ ...mono(9.5), color: t.neutrals.muted, whiteSpace: 'nowrap' as const }}>
                          Top3 <span style={{ color: e.top3 > 0 ? t.neutrals.text : t.accent.neg, fontWeight: 600 }}>{e.top3}%</span>
                          <span style={{ color: t.neutrals.subtle, marginLeft: 6 }}>{e.runs}회</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {data.daily.length > 1 && (
                  <div style={{ ...mono(9), color: t.neutrals.subtle, lineHeight: 1.5, marginTop: 8 }}>
                    Top3 추이 {data.daily.map(d => `${d.top3}%`).join(' → ')}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </LCard>
  )
}
