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
import { DataTable, panelStyle, EmptyLine } from './linear-data-table'
import { CAUSE_LABEL, STAGE_LABEL, type GeoAnswerStats, type GeoCause, type GeoStage } from '@/lib/geo-types'

const mono = (size: number): React.CSSProperties => ({
  fontSize: `calc(${size}px * var(--fz, 1))`, fontFamily: t.font.mono,
  fontVariantNumeric: 'tabular-nums' as const,
})

// 원인별 색: 처방이 다른 만큼 눈으로도 갈라야 한다
const CAUSE_TONE: Record<Exclude<GeoCause, null>, { bg: string; fg: string }> = {
  index: tonePalettes.neg,
  authority: tonePalettes.warn,
  content: tonePalettes.info,
  competitor: tonePalettes.pending,
}

const STAGE_TONE: Record<GeoStage, { bg: string; fg: string }> = {
  absent: tonePalettes.neg,
  cited: tonePalettes.warn,
  mentioned: tonePalettes.info,
  recommended: tonePalettes.pos,
}

function Pill({ tone, children }: { tone: { bg: string; fg: string }; children: React.ReactNode }) {
  return (
    <span style={{
      ...mono(8.5), padding: '1px 5px', borderRadius: 3, whiteSpace: 'nowrap' as const,
      background: tone.bg, color: tone.fg,
    }}>{children}</span>
  )
}

// 주 라벨 — measured_week 은 그 주 월요일이라 같은 주에 다시 재도 안 움직인다.
// 날짜만 찍으면 "7/27 측정"으로 읽혀서 갱신이 멈춘 것처럼 보인다. 주라고 밝히고,
// 실제로 언제 잰 값인지는 옆에 따로 적는다.
const weekLabel = (week: string) => {
  const [, m, d] = week.split('-')
  const end = new Date(`${week}T00:00:00Z`)
  end.setUTCDate(end.getUTCDate() + 6)
  return `${Number(m)}/${Number(d)}~${end.getUTCMonth() + 1}/${end.getUTCDate()}`
}

/** 마지막 측정 시각 — KST 기준 M/D HH:mm */
const measuredLabel = (iso: string) => {
  const d = new Date(iso)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d)
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  return `${get('month')}/${get('day')} ${get('hour')}:${get('minute')}`
}

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
            ? `${weekLabel(data.latestDay)} 주${data.latestMeasuredAt ? ` · 마지막 측정 ${measuredLabel(data.latestMeasuredAt)}` : ''} · 질문 ${data.questions.length}개 · ${data.latest.runs}회 실행${hasBaseline ? ` · 기준선 ${weekLabel(data.baselineDay!)} 주` : ' · 기준선 회차'}`
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
              <LStat
                label="AI 유입 클릭"
                value={data.aiClicks.total.toLocaleString()}
                sub={`오늘 ${data.aiClicks.today.toLocaleString()}회 · 7일 ${data.aiClicks.last7d.toLocaleString()}회`}
                tone={data.aiClicks.last7d > 0 ? 'pos' : 'default'}
                title="답변에 실린 링크를 사람이 눌러 들어온 횟수(크롤 로그 referral). 인용이 트래픽이 됐는지를 본다."
              />
              <LStat
                label="색인된 페이지 (원본)"
                value={data.indexedPages.toLocaleString()}
                sub={`오늘 ${data.indexedPagesDelta.today.toLocaleString()}쪽 · 7일 ${data.indexedPagesDelta.last7d.toLocaleString()}쪽`}
                tone={data.indexedPages > 0 ? 'default' : 'warn'}
                title={data.indexedPagesLocale > 0
                  ? `영어 원본 기준. 로케일 변형 ${data.indexedPagesLocale.toLocaleString()}쪽이 더 색인돼 있다. 색인이 없으면 답변엔진이 인용할 대상 자체가 없다 — 실패 원인 '색인' 판정의 근거.`
                  : "색인이 없으면 답변엔진이 인용할 대상 자체가 없다. 실패 원인 '색인' 판정의 근거."}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: panelCols, gap: 8, alignItems: 'stretch' }}>
              <DataTable
                title="질문별 현황"
                columns={[
                  { key: 'q', label: '질문', width: 'minmax(140px,1fr)' },
                  // 가장 긴 배지 '추천 Top3'가 56px다. 더 줄이면 잘린다
                  { key: 's', label: '단계', width: '58px' },
                  { key: 't', label: 'Top3', width: '46px', align: 'right' as const },
                ]}
                rows={data.questions.map(q => ({
                  key: q.questionId,
                  cells: [
                    // paddingRight: 표 공통 간격 6px만으로는 말줄임표가 배지에 거의 닿는다.
                    // 여기서만 더 띄운다 — 잘린 문장과 그 옆 배지는 붙어 있으면 한 덩어리로 읽힌다.
                    <span key="q" title={`${q.question}\n${q.competitors.length ? '경쟁: ' + q.competitors.join(', ') : ''}`}
                      style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>
                      {q.question}
                    </span>,
                    <Pill key="s" tone={STAGE_TONE[q.stage]}>{STAGE_LABEL[q.stage]}</Pill>,
                    <span key="t" style={{ color: q.top3 > 0 ? t.neutrals.text : t.accent.neg, fontWeight: 600 }}>{q.top3}%</span>,
                  ],
                  sort: [q.question, q.stage, q.top3],
                }))}
                empty="측정된 질문이 없습니다"
              />

              {/* 원인별 처방은 docs/geo-operations.md에 표로 있다. 화면에서는 어느 원인이
                  몇 질문을 막고 있는지만 본다 */}
              <DataTable
                title="실패 원인"
                minWidth={220}
                columns={[
                  { key: 'c', label: '원인', width: 'minmax(80px,1fr)' },
                  { key: 'n', label: '질문', width: '46px', align: 'right' as const },
                ]}
                rows={data.causes.map(c => ({
                  key: c.cause,
                  cells: [
                    <Pill key="c" tone={CAUSE_TONE[c.cause]}>{CAUSE_LABEL[c.cause]}</Pill>,
                    String(c.questions),
                  ],
                  sort: [c.cause, c.questions],
                }))}
                empty="Top3를 놓친 질문이 없습니다"
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

              {/* 엔진마다 우리를 보는 방식이 달라서(한쪽은 인용까지, 한쪽은 브랜드만) 세 지표를 다 편다 */}
              <DataTable
                title="엔진별"
                meta={data.daily.length > 1 ? `Top3 추이 ${data.daily.map(d => `${d.top3}%`).join(' → ')}` : undefined}
                minWidth={260}
                columns={[
                  { key: 'e', label: '엔진', width: 'minmax(64px,1fr)' },
                  { key: 'm', label: '언급', width: '46px', align: 'right' as const },
                  { key: 't', label: 'Top3', width: '46px', align: 'right' as const },
                  { key: 'c', label: '인용', width: '46px', align: 'right' as const },
                  { key: 'r', label: '실행', width: '40px', align: 'right' as const },
                ]}
                rows={data.byEngine.map(e => ({
                  key: e.engine,
                  cells: [
                    e.engine,
                    `${e.mentioned}%`,
                    <span key="t" style={{ color: e.top3 > 0 ? t.neutrals.text : t.accent.neg, fontWeight: 600 }}>{e.top3}%</span>,
                    `${e.cited}%`,
                    String(e.runs),
                  ],
                  sort: [e.engine, e.mentioned, e.top3, e.cited, e.runs],
                }))}
                empty="측정 엔진이 없습니다"
              />
            </div>
          </div>
        )}
      </div>
    </LCard>
  )
}
