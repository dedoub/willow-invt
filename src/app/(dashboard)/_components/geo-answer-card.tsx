'use client'

// LLM 노출 — 검색 수요 포착 섹션의 GEO판.
//
// 검색이 "우리 페이지가 결과에 뜨는가"를 묻는다면 여기는 "답변에 우리가 추천되는가"를 묻는다.
// 지표 순서도 퍼널이다: 언급 → 추천 Top3 → 인용.
// 헤드라인은 인용률이 아니라 **추천 Top3**다. 링크만 인용되고 경쟁사를 추천하는 답변이 흔해서,
// 인용률만 보면 나아지는 것처럼 착각한다.

import { useCallback, useEffect, useState } from 'react'
import { t, tonePalettes } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LCardFoot } from '@/app/(dashboard)/_components/linear-card-foot'
import { LSectionHead, LHeadBtn } from '@/app/(dashboard)/_components/linear-section-head'
import { FigureGrid, type FigureItem } from '@/app/(dashboard)/_components/linear-figure-grid'
import { useDashCols } from '@/app/(dashboard)/_components/cols-toggle'
import { useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { DataTable, panelStyle, EmptyLine } from '@/app/(dashboard)/_components/linear-data-table'
import { Bone } from '@/app/(dashboard)/_components/linear-skeleton'
import { LNotice } from '@/app/(dashboard)/_components/linear-notice'
import { CAUSE_LABEL, STAGE_LABEL, type GeoAnswerStats, type GeoCause, type GeoStage } from '@/lib/geo-types'

const mono = (size: number): React.CSSProperties => ({
  fontSize: `calc(${size}px * var(--fz, 1))`, fontFamily: t.font.mono,
  fontVariantNumeric: 'tabular-nums' as const,
})

// 단계·원인은 표의 한 칸일 뿐이라 색도 배경도 두지 않는다(CEO 2026-09-11).
const PLAIN = { bg: 'transparent', fg: t.neutrals.muted }
const CAUSE_TONE: Record<Exclude<GeoCause, null>, { bg: string; fg: string }> = {
  index: PLAIN, authority: PLAIN, content: PLAIN, competitor: PLAIN,
}
const STAGE_TONE: Record<GeoStage, { bg: string; fg: string }> = {
  absent: PLAIN, cited: PLAIN, mentioned: PLAIN, recommended: PLAIN,
}

// 배경 없이 글자만 — 표가 카드 안으로 들어온 것뿐이라 칩으로 부풀리지 않는다(CEO 2026-09-11).
// 단계·원인의 무게는 글자 색 한 단계로만 남긴다.
function Pill({ tone, children }: { tone: { bg: string; fg: string }; children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`, whiteSpace: 'nowrap' as const,
      color: tone.fg,
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
    <span style={{ ...mono(9.5), marginLeft: t.density.gapSm, fontWeight: t.weight.semibold, color: diff > 0 ? t.accent.pos : t.accent.neg }}>
      {diff > 0 ? '+' : '−'}{Math.abs(diff)}%p
    </span>
  )
}

export function GeoAnswerCard({ site }: { site: 'voicecards' | 'reviewnotes' | 'valuechain' | 'portle' | 'scripta' }) {
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
      <div style={{ padding: t.density.cardPad, paddingBottom: t.density.blockGap }}>
        <LSectionHead
          title="LLM 노출"
          action={<LHeadBtn icon="refresh" title="다시 조회" onClick={load} busy={loading} />}
          mb={t.density.panelPadY + t.density.panelPadX}
        />

        {error && <LNotice tone="warn" text={`AI 답변 측정 조회 실패 — ${error}`} />}

        {/* 첫 조회는 뼈대로 기다린다. 여기만 뼈대가 없어 제목만 뜬 채 비어 있다가
            숫자가 튀어나왔다 — 카드가 고장 난 것처럼 보인다. 다시 조회는 이미
            있는 값을 두고 헤더 버튼만 돈다. */}
        {loading && !data && <GeoSkeleton statCols={statCols} panelCols={panelCols} />}

        {!error && !loading && data && data.latest.runs === 0 && (
          <div style={{ ...panelStyle, minHeight: 96 }}>
            <EmptyLine>
              아직 측정 기록이 없습니다<br />
              `node scripts/geo-measure.mjs {site} gemini 3` 으로 기준선을 만드세요
            </EmptyLine>
          </div>
        )}

        {data && data.latest.runs > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: t.density.kpiGap }}>
            {(() => {
              const figures: FigureItem[] = [
                {
                  label: '추천 Top3', value: `${data.latest.top3}%`, mono: true,
                  valueExtra: <Delta now={data.latest.top3} base={hasBaseline ? data.baseline.top3 : null} />,
                  sub: '답변의 추천 상위 3개 안에 든 비율',
                  title: '이 섹션의 핵심 지표. 링크만 인용되고 경쟁사가 추천되는 경우가 많아, 인용률보다 이쪽이 실제 점유를 나타낸다.',
                },
                {
                  label: '언급률', value: `${data.latest.mentioned}%`, mono: true,
                  valueExtra: <Delta now={data.latest.mentioned} base={hasBaseline ? data.baseline.mentioned : null} />,
                  sub: '답변 본문에 브랜드가 등장한 비율',
                  title: '답변이 우리를 알기는 하는가. 언급은 되는데 Top3가 낮으면 인지도가 아니라 설득력 문제다.',
                },
                {
                  label: '인용률', value: `${data.latest.cited}%`, mono: true,
                  valueExtra: <Delta now={data.latest.cited} base={hasBaseline ? data.baseline.cited : null} />,
                  sub: '우리 URL이 출처로 붙은 비율',
                  title: '출처 목록에 우리 도메인이 들어간 비율. 인용돼도 추천은 경쟁사일 수 있으니 단독으로 읽지 말 것.',
                },
                {
                  label: 'AI 유입 클릭', value: data.aiClicks.total.toLocaleString(), mono: true,
                  sub: `오늘 ${data.aiClicks.today.toLocaleString()}회 · 7일 ${data.aiClicks.last7d.toLocaleString()}회`,
                  title: '답변에 실린 링크를 사람이 눌러 들어온 횟수(크롤 로그 referral). 인용이 트래픽이 됐는지를 본다.',
                },
                {
                  label: '색인된 페이지 (원본)', value: data.indexedPages.toLocaleString(), mono: true,
                  sub: `오늘 ${data.indexedPagesDelta.today.toLocaleString()}쪽 · 7일 ${data.indexedPagesDelta.last7d.toLocaleString()}쪽`,
                  title: data.indexedPagesLocale > 0
                    ? `영어 원본 기준. 로케일 변형 ${data.indexedPagesLocale.toLocaleString()}쪽이 더 색인돼 있다.`
                    : '색인이 없으면 답변엔진이 인용할 대상 자체가 없다.',
                },
              ]
              return <FigureGrid items={figures} cols={mobile ? 2 : 3} />
            })()}

            <div style={{ display: 'grid', gridTemplateColumns: panelCols, gap: `${t.density.pagePadBottom}px ${t.density.pagePadX}px`, alignItems: 'start', marginTop: t.density.blockGap }}>
              <DataTable
                title="질문별 현황"
                hideTitle
                columns={[
                  { key: 'q', label: '질문별 현황', width: 'minmax(140px,1fr)' },
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
                      style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: t.density.panelPadY }}>
                      {q.question}
                    </span>,
                    <Pill key="s" tone={STAGE_TONE[q.stage]}>{STAGE_LABEL[q.stage]}</Pill>,
                    <span key="t" style={{ color: q.top3 > 0 ? t.neutrals.text : t.neutrals.subtle, fontWeight: t.weight.semibold }}>{q.top3}%</span>,
                  ],
                  sort: [q.question, q.stage, q.top3],
                }))}
                empty="측정된 질문이 없습니다"
              />

              {/* 원인별 처방은 docs/geo-operations.md에 표로 있다. 화면에서는 어느 원인이
                  몇 질문을 막고 있는지만 본다 */}
              <DataTable
                title="실패 원인"
                hideTitle
                minWidth={220}
                columns={[
                  { key: 'c', label: '실패 원인', width: 'minmax(80px,1fr)' },
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
                hideTitle
                minWidth={240}
                columns={[
                  { key: 'name', label: '우리가 빠진 자리의 경쟁사', width: 'minmax(120px,1fr)' },
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
                hideTitle
                minWidth={260}
                columns={[
                  { key: 'e', label: '엔진별', width: 'minmax(64px,1fr)' },
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
                    <span key="t" style={{ color: e.top3 > 0 ? t.neutrals.text : t.neutrals.subtle, fontWeight: t.weight.semibold }}>{e.top3}%</span>,
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
      {data?.latestDay && (
        <LCardFoot
          left={`질문 ${data.questions.length}개 · ${data.latest.runs}회 실행${hasBaseline ? ` · 기준선 ${weekLabel(data.baselineDay!)} 주` : ' · 기준선 회차'}`}
          right={`${weekLabel(data.latestDay)} 주${data.latestMeasuredAt ? ` · 측정 ${measuredLabel(data.latestMeasuredAt)}` : ''}`}
          style={{ marginTop: 0, padding: `${t.density.panelPadY}px ${t.density.cardPad}px` }}
        />
      )}
    </LCard>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
// 실물과 같은 자리에 세운다 — KPI 다섯 장과 그 아래 표 패널들. 뼈대가 다른
// 자리에 있으면 로딩이 끝나는 순간 화면이 튄다.

function GeoSkeleton({ statCols, panelCols }: { statCols: string; panelCols: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: t.density.kpiGap }}>
      <div style={{ display: 'grid', gridTemplateColumns: statCols, gap: t.density.kpiGap }}>
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} style={{ ...panelStyle, minHeight: 72, gap: t.density.gapSm }}>
            <Bone w={64} h={9} />
            <Bone w={52} h={16} />
            <Bone w={'85%'} h={9} />
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: panelCols, gap: t.density.kpiGap, alignItems: 'stretch' }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ ...panelStyle, minHeight: 132, gap: t.density.gapSm }}>
            <Bone w={72} h={9} style={{ marginBottom: t.density.tableRowGap }} />
            {[0, 1, 2, 3].map(row => (
              <div key={row} style={{ display: 'flex', alignItems: 'center', gap: t.density.gapSm }}>
                <Bone w={'100%'} h={9} />
                <Bone w={28} h={9} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
