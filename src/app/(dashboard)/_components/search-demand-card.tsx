'use client'

// 검색 수요 포착 — 보이스카드/리뷰노트 페이지 최상단 공용. 두 섹션으로 나뉜다.
//
//   1) Search Console — 색인 → 노출 → 클릭. 수요가 있는지, 그중 얼마를 잡는지.
//   2) Umami          — 진입 후 행동. 잡은 수요가 사이트 안에서 어떻게 되는지.
//
// 방문자 수를 세는 카드가 아니라 "발행한 페이지가 검색 수요를 잡고 있는가"를 보는 카드다.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { t, tonePalettes, useIsMobile } from './linear-tokens'
import { LCard } from './linear-card'
import { LSectionHead } from './linear-section-head'
import { LStat } from './linear-stat'
import { LIcon } from './linear-icons'
import { DataTable, type TableRow, panelStyle, panelTitle, EmptyLine } from './linear-data-table'
import { formatCountryName } from '@/lib/country-format'
import { useDashCols } from './cols-toggle'
import type { SearchDemandStats, Channel, UmamiSiteKey } from '@/lib/umami'
import type { SearchConsoleStats } from '@/lib/gsc'
import type { IndexStatusSummary, IndexBucket } from '@/lib/gsc-index'

// ─── 상수 ─────────────────────────────────────────────────────────────────────

const PERIODS = [7, 30, 90] as const
type Period = typeof PERIODS[number]

const SEARCH_COLOR = '#166A97'   // 검색 유입 (brand 600)
const OTHER_COLOR = '#C9CDD4'    // 그 외 유입
const PV_COLOR = '#B8781F'       // 페이지뷰 라인 (warn)

const CHANNEL_LABEL: Record<Channel, string> = {
  search: '검색', ai: 'AI 답변', social: '소셜', referral: '추천', direct: '직접',
}
const CHANNEL_COLOR: Record<Channel, string> = {
  search: SEARCH_COLOR, ai: '#4A9EC9', social: '#8b5cf6', referral: '#B8781F', direct: '#C9CDD4',
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
function withWeekday(d: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d} (${WEEKDAYS[new Date(d + 'T00:00:00Z').getUTCDay()]})` : d
}

// 브라우저 언어 태그 → 한국어 언어명. ko-KR·ko 모두 '한국어'로 접는다
// (지역 구분은 옆 국가 칼럼이 이미 하고 있어 여기서 또 나눌 이유가 없다).
const LANG_DISPLAY = typeof Intl !== 'undefined' && 'DisplayNames' in Intl
  ? new Intl.DisplayNames(['ko'], { type: 'language' })
  : null

function langName(code: string): string {
  const base = code.split(/[-_]/)[0].toLowerCase()
  if (!base) return code
  try {
    return LANG_DISPLAY?.of(base) ?? base
  } catch {
    return base
  }
}

/** 일별 값을 기간 누적으로 바꾼다. 하루치가 한 자릿수인 구간에서는 누적선이 추세를 더 정직하게 보여준다 */
function cumulative(daily: Array<{ date: string; value: number }>): Array<{ date: string; value: number }> {
  let sum = 0
  return daily.map(d => ({ date: d.date, value: (sum += d.value) }))
}

function fmtAgo(iso: string | null): string {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const min = Math.floor(ms / 60_000)
  if (min < 1) return '방금'
  if (min < 60) return `${min}분 전`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}시간 전`
  const day = Math.floor(hr / 24)
  return day < 30 ? `${day}일 전` : `${Math.floor(day / 30)}개월 전`
}

function fmtDuration(sec: number): string {
  if (!sec || sec < 0) return '0초'
  if (sec < 60) return `${Math.round(sec)}초`
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return s ? `${m}분 ${s}초` : `${m}분`
}

const mono = (size: number): React.CSSProperties => ({
  fontSize: `calc(${size}px * var(--fz, 1))`, fontFamily: t.font.mono,
  fontVariantNumeric: 'tabular-nums' as const,
})

// ─── 일별 추이 (검색 세션 vs 그 외 + 페이지뷰 라인) ───────────────────────────

function TrafficTrendCard({ daily }: { daily: SearchDemandStats['daily'] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const rows = daily ?? []
  const maxSessions = rows.reduce((m, r) => Math.max(m, r.sessions), 0)
  const maxPv = rows.reduce((m, r) => Math.max(m, r.pageviews), 0)
  // 바 위 합산 라벨 — 90일은 바가 좁아 숫자가 겹치므로 30일 이하에서만.
  // 라벨이 붙는 만큼 바 최대치를 낮춰 최고점 숫자가 차트 밖으로 밀리지 않게 한다.
  const showLabels = rows.length > 0 && rows.length <= 31
  const barPct = (v: number) => (maxSessions > 0 ? (v / maxSessions) * (showLabels ? 90 : 100) : 0)
  const latest = rows.length ? rows[rows.length - 1] : null

  return (
    <div style={{ ...panelStyle, minHeight: 132 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
        <div style={panelTitle}>일별 유입</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...mono(9), whiteSpace: 'nowrap' as const }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: t.neutrals.muted }}>
            <span style={{ width: 6, height: 6, borderRadius: 1, background: SEARCH_COLOR }} />검색 {latest?.searchSessions ?? 0}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: t.neutrals.muted }}>
            <span style={{ width: 6, height: 6, borderRadius: 1, background: OTHER_COLOR }} />그 외 {Math.max(0, (latest?.sessions ?? 0) - (latest?.searchSessions ?? 0))}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: t.neutrals.muted }}>
            <span style={{ width: 10, height: 2, borderRadius: 1, background: PV_COLOR }} />페이지뷰 {latest?.pageviews ?? 0}
          </span>
        </div>
      </div>

      {rows.length === 0 || maxSessions === 0 ? (
        <EmptyLine>아직 세션 데이터가 없습니다</EmptyLine>
      ) : (
        <div style={{ flex: 1, minHeight: 96, display: 'flex', alignItems: 'stretch', gap: 2, position: 'relative' }}>
          {rows.map((r, i) => {
            const searchH = barPct(r.searchSessions)
            const otherH = barPct(Math.max(0, r.sessions - r.searchSessions))
            const dim = hoverIdx !== null && hoverIdx !== i
            return (
              <div key={r.date}
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(prev => (prev === i ? null : prev))}
                style={{ flex: 1, minWidth: 2, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', cursor: 'default' }}>
                {showLabels && r.sessions > 0 && (
                  <span style={{
                    fontSize: 'calc(7.5px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.subtle,
                    fontVariantNumeric: 'tabular-nums' as const, lineHeight: 1, alignSelf: 'center', marginBottom: 2,
                    whiteSpace: 'nowrap' as const, opacity: dim ? 0.25 : 0.7, transition: 'opacity 120ms ease',
                  }}>{r.sessions}</span>
                )}
                {searchH > 0 && <div style={{ height: `${searchH}%`, background: SEARCH_COLOR, borderRadius: '1px 1px 0 0', opacity: dim ? 0.4 : 1, transition: 'opacity 120ms ease' }} />}
                {otherH > 0 && <div style={{ height: `${otherH}%`, background: OTHER_COLOR, borderRadius: searchH > 0 ? 0 : '1px 1px 0 0', opacity: dim ? 0.4 : 1, transition: 'opacity 120ms ease' }} />}
              </div>
            )
          })}

          {maxPv > 0 && rows.length > 1 && (
            <svg viewBox="0 0 100 100" preserveAspectRatio="none"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
              <polyline
                points={rows.map((r, i) => `${(((i + 0.5) / rows.length) * 100).toFixed(2)},${(100 - (r.pageviews / maxPv) * 100).toFixed(2)}`).join(' ')}
                fill="none" stroke={PV_COLOR} strokeWidth={1.2} opacity={0.7}
                vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
          )}

          {hoverIdx !== null && rows[hoverIdx] && (() => {
            const r = rows[hoverIdx]
            const leftPct = Math.min(86, Math.max(14, ((hoverIdx + 0.5) / rows.length) * 100))
            return (
              <div style={{
                position: 'absolute', left: `${leftPct}%`, transform: 'translateX(-50%)',
                bottom: `calc(${barPct(r.sessions).toFixed(1)}% + 8px)`, pointerEvents: 'none', zIndex: 10,
                background: '#1E293B', color: '#F8FAFC',
                fontSize: 'calc(11px * var(--fz, 1))', fontFamily: t.font.sans, lineHeight: 1.4,
                borderRadius: 6, padding: '6px 10px', whiteSpace: 'nowrap',
              }}>
                <div style={{ opacity: 0.7, marginBottom: 3 }}>{withWeekday(r.date)}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 1, background: SEARCH_COLOR }} />검색 {r.searchSessions}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 1, background: OTHER_COLOR }} />그 외 {Math.max(0, r.sessions - r.searchSessions)}
                </div>
                <div style={{ opacity: 0.7, marginTop: 3 }}>세션 {r.sessions} · 페이지뷰 {r.pageviews}</div>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}

// ─── 공용 테이블 (사용자 테이블과 동일 문법) ─────────────────────────────────
// 헤더는 mono 대문자, 행은 패널(inner) 위에 카드색으로 얹고, 숫자는 tabular-nums.
// 좁은 폭에서는 가로 스크롤 — 사용자 테이블이 쓰는 방식 그대로다.


// ─── 채널 믹스 ────────────────────────────────────────────────────────────────

// 채널 비중 + 그 채널을 만든 리퍼러 호스트를 한 표에 담는다.
// 채널 행 아래 그 채널의 호스트가 붙어, 검색/AI 유입이 어디서 왔는지까지 한눈에 본다.
function ChannelMixCard({ data }: { data: SearchDemandStats }) {
  const channels = data.channels
  const total = channels.reduce((s, c) => s + c.visits, 0)
  const hostsOf = (ch: Channel) => data.search.referrers.filter(r => r.channel === ch).slice(0, 4)
  const rows: TableRow[] = []
  for (const c of channels) {
    rows.push({
      key: c.channel,
      cells: [
        <span key="c" style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
          <span style={{ width: 6, height: 6, borderRadius: 1, background: CHANNEL_COLOR[c.channel], flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{CHANNEL_LABEL[c.channel]}</span>
        </span>,
        c.visits.toLocaleString(),
        `${c.share}%`,
      ],
      sort: [CHANNEL_LABEL[c.channel], c.visits, c.share],
    })
    for (const r of hostsOf(c.channel)) {
      rows.push({
        key: `${c.channel}:${r.host}`,
        cells: [
          <span key="h" style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, paddingLeft: 10, color: t.neutrals.muted }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.host}</span>
          </span>,
          r.visits.toLocaleString(),
          '',
        ],
        sort: [r.host, r.visits, 0],
      })
    }
  }
  return (
    <DataTable
      title="유입 채널"
      meta={total > 0 ? `세션 ${total.toLocaleString()}` : undefined}
      minWidth={240}
      columns={[
        { key: 'channel', label: '채널', width: 'minmax(90px,1fr)' },
        { key: 'visits', label: '세션', width: '48px', align: 'right' as const },
        { key: 'share', label: '비중', width: '48px', align: 'right' as const },
      ]}
      rows={rows}
      empty="아직 유입이 없습니다"
    />
  )
}

// 지역·언어 — 국가와 브라우저 언어를 순위별로 나란히 놓는다. 둘 다 "어디 사람인가"의 다른 측면.
function RegionLanguageCard({ data }: { data: SearchDemandStats }) {
  // en-US·en-GB가 각각 '영어' 두 줄로 보이면 버그처럼 읽힌다 — 이름으로 접은 뒤 합산
  const langs = useMemo(() => {
    const acc = new Map<string, number>()
    for (const l of data.languages) {
      const name = langName(l.code)
      acc.set(name, (acc.get(name) ?? 0) + l.visits)
    }
    return Array.from(acc.entries())
      .map(([name, visits]) => ({ name, visits }))
      .sort((a, b) => b.visits - a.visits)
  }, [data.languages])

  const n = Math.max(data.countries.length, langs.length)
  const rows: TableRow[] = Array.from({ length: n }, (_, i) => {
    const c = data.countries[i]
    const l = langs[i]
    return {
      key: `${c?.code ?? '-'}:${l?.name ?? '-'}:${i}`,
      cells: [
        c ? formatCountryName(c.code) : '', c ? c.visits.toLocaleString() : '',
        l?.name ?? '', l ? l.visits.toLocaleString() : '',
      ],
      sort: [c?.code ?? '', c?.visits ?? 0, l?.name ?? '', l?.visits ?? 0],
    }
  })
  return (
    <DataTable
      title="지역 · 언어"
      minWidth={252}
      columns={[
        { key: 'country', label: '국가', width: 'minmax(52px,1fr)' },
        { key: 'cv', label: '세션', width: '46px', align: 'right' as const },
        { key: 'lang', label: '언어', width: 'minmax(56px,1fr)' },
        { key: 'lv', label: '세션', width: '46px', align: 'right' as const },
      ]}
      rows={rows}
      empty="기록 없음"
    />
  )
}

// ─── Search Console: 노출/클릭 추이 ───────────────────────────────────────────

const IMPRESSION_COLOR = '#C9CDD4'
const CLICK_COLOR = '#166A97'

function GscTrendCard({ daily }: { daily: SearchConsoleStats['daily'] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const rows = daily ?? []
  const maxImp = rows.reduce((m, r) => Math.max(m, r.impressions), 0)
  const maxClick = rows.reduce((m, r) => Math.max(m, r.clicks), 0)
  const latest = rows.length ? rows[rows.length - 1] : null
  // 바 위 데이터 라벨 — 90일은 바가 좁아 숫자가 겹치므로 30일 이하에서만
  const showLabels = rows.length > 0 && rows.length <= 31

  return (
    <div style={{ ...panelStyle, minHeight: 132 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
        <div style={panelTitle}>일별 노출 · 클릭</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...mono(9), whiteSpace: 'nowrap' as const }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: t.neutrals.muted }}>
            <span style={{ width: 6, height: 6, borderRadius: 1, background: IMPRESSION_COLOR }} />노출 {latest?.impressions ?? 0}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: t.neutrals.muted }}>
            <span style={{ width: 10, height: 2, borderRadius: 1, background: CLICK_COLOR }} />클릭 {latest?.clicks ?? 0}
          </span>
        </div>
      </div>

      {rows.length === 0 || maxImp === 0 ? (
        <EmptyLine>기간 내 검색 노출이 없습니다</EmptyLine>
      ) : (
        <div style={{ flex: 1, minHeight: 96, display: 'flex', alignItems: 'stretch', gap: 2, position: 'relative' }}>
          {rows.map((r, i) => {
            const dim = hoverIdx !== null && hoverIdx !== i
            return (
              <div key={r.date}
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(prev => (prev === i ? null : prev))}
                style={{ flex: 1, minWidth: 2, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', cursor: 'default' }}>
                {showLabels && r.impressions > 0 && (
                  <span style={{
                    fontSize: 'calc(7.5px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.subtle,
                    fontVariantNumeric: 'tabular-nums' as const, lineHeight: 1, alignSelf: 'center', marginBottom: 2,
                    whiteSpace: 'nowrap' as const, opacity: dim ? 0.25 : 0.7, transition: 'opacity 120ms ease',
                  }}>{r.impressions}</span>
                )}
                <div style={{
                  // 라벨이 붙는 만큼 바 최대치를 낮춰 최고점 숫자가 차트 밖으로 밀리지 않게 한다
                  height: `${(r.impressions / maxImp) * (showLabels ? 90 : 100)}%`, background: IMPRESSION_COLOR,
                  borderRadius: '1px 1px 0 0', opacity: dim ? 0.4 : 1, transition: 'opacity 120ms ease',
                }} />
              </div>
            )
          })}

          {maxClick > 0 && rows.length > 1 && (
            <svg viewBox="0 0 100 100" preserveAspectRatio="none"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
              <polyline
                points={rows.map((r, i) => `${(((i + 0.5) / rows.length) * 100).toFixed(2)},${(100 - (r.clicks / maxClick) * 100).toFixed(2)}`).join(' ')}
                fill="none" stroke={CLICK_COLOR} strokeWidth={1.4} opacity={0.9}
                vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
          )}

          {hoverIdx !== null && rows[hoverIdx] && (() => {
            const r = rows[hoverIdx]
            const leftPct = Math.min(86, Math.max(14, ((hoverIdx + 0.5) / rows.length) * 100))
            return (
              <div style={{
                position: 'absolute', left: `${leftPct}%`, transform: 'translateX(-50%)',
                bottom: `calc(${((r.impressions / maxImp) * (showLabels ? 90 : 100)).toFixed(1)}% + 8px)`, pointerEvents: 'none', zIndex: 10,
                background: '#1E293B', color: '#F8FAFC',
                fontSize: 'calc(11px * var(--fz, 1))', fontFamily: t.font.sans, lineHeight: 1.4,
                borderRadius: 6, padding: '6px 10px', whiteSpace: 'nowrap',
              }}>
                <div style={{ opacity: 0.7, marginBottom: 3 }}>{withWeekday(r.date)}</div>
                <div>노출 {r.impressions.toLocaleString()} · 클릭 {r.clicks.toLocaleString()}</div>
                <div style={{ opacity: 0.7, marginTop: 3 }}>CTR {r.ctr}% · 평균 {r.position}위</div>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}

// ─── 색인 상태 ────────────────────────────────────────────────────────────────

// 상태별 색: 색인됨만 브랜드색, 나머지는 원인 성격에 맞춰 경고/중립
const BUCKET_COLOR: Record<IndexBucket, string> = {
  indexed: '#166A97',
  crawled: '#B8781F',    // 콘텐츠 판단 문제
  discovered: '#4A9EC9', // 대기 중
  unseen: '#C23A3A',     // 발견 자체가 안 된 것 — 가장 기본적인 실패
  excluded: '#9398A0',
  unknown: '#C9CDD4',
}
const BUCKET_LABEL_UI: Record<IndexBucket, string> = {
  indexed: '색인됨',
  crawled: '크롤됐지만 미색인',
  discovered: '발견됨 · 크롤 대기',
  unseen: '구글이 모름',
  excluded: '제외됨',
  unknown: '알 수 없음',
}
const BUCKET_ORDER: IndexBucket[] = ['indexed', 'crawled', 'discovered', 'unseen', 'excluded', 'unknown']

// 상태 분포 + 색인 추이. 색인률 자체는 상단 지표 카드에 있으니 여기서는 구성만 본다.
function IndexStatusCard({ data }: { data: IndexStatusSummary }) {
  const total = data.total
  const entries = BUCKET_ORDER.map(b => ({ bucket: b, n: data.buckets[b] })).filter(e => e.n > 0)
  return (
    <DataTable
      title="색인 상태"
      meta={total > 0 ? (
        <>
          {data.latestDate} · {total.toLocaleString()}쪽
          {/* 4열 헤더에 30일치 숫자는 다 못 들어간다 — 최근 7회만 */}
          {data.trend.length > 1 && <> · 추이 {data.trend.slice(-7).map(d => d.indexed).join(' → ')}</>}
          {data.changeFromPrev != null && data.changeFromPrev !== 0 && (
            <span style={{ marginLeft: 4, fontWeight: 600, color: data.changeFromPrev > 0 ? t.accent.pos : t.accent.neg }}>
              ({data.changeFromPrev > 0 ? '+' : '−'}{Math.abs(data.changeFromPrev)})
            </span>
          )}
        </>
      ) : undefined}
      minWidth={260}
      columns={[
        { key: 'status', label: '상태', width: 'minmax(90px,1fr)' },
        { key: 'n', label: '쪽수', width: '48px', align: 'right' as const },
        { key: 'pct', label: '비율', width: '52px', align: 'right' as const },
      ]}
      rows={entries.map(e => ({
        key: e.bucket,
        cells: [
          <span key="s" style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
            <span style={{ width: 6, height: 6, borderRadius: 1, background: BUCKET_COLOR[e.bucket], flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{BUCKET_LABEL_UI[e.bucket]}</span>
          </span>,
          e.n.toLocaleString(),
          `${Math.round((e.n / total) * 1000) / 10}%`,
        ],
        sort: [BUCKET_LABEL_UI[e.bucket], e.n, e.n / total],
      }))}
      empty={<>아직 색인 검사 기록이 없습니다<br />크론이 하루 1회 전수 검사합니다</>}
    />
  )
}

// 버티컬별 색인률 — 전체 평균은 판단에 안 쓰이고, 어느 클러스터가 막혔는지가 처방으로 이어진다.
function IndexGroupsCard({ data }: { data: IndexStatusSummary }) {
  return (
    <DataTable
      title="버티컬별 색인률"
      minWidth={260}
      columns={[
        { key: 'label', label: '버티컬', width: 'minmax(70px,1fr)' },
        { key: 'indexed', label: '색인', width: '44px', align: 'right' as const },
        { key: 'total', label: '전체', width: '44px', align: 'right' as const },
        { key: 'pct', label: '색인률', width: '52px', align: 'right' as const },
      ]}
      rows={data.groups.map(g => ({
        key: g.key,
        cells: [
          g.label,
          g.indexed.toLocaleString(),
          g.total.toLocaleString(),
          // 0%는 막힌 클러스터라 눈에 걸리게 둔다
          <span key="pct" style={{ color: g.pct > 0 ? t.neutrals.text : t.accent.neg, fontWeight: 600 }}>{g.pct}%</span>,
        ],
        sort: [g.label, g.indexed, g.total, g.pct],
      }))}
      empty="아직 색인 검사 기록이 없습니다"
    />
  )
}

/** 직전 동일 기간 대비 증감 배지 */
function Delta({ now, prev }: { now: number; prev: number }) {
  if (!prev) return null
  const diff = now - prev
  if (diff === 0) return null
  const pct = Math.round((diff / prev) * 100)
  return (
    <span style={{
      ...mono(9.5), marginLeft: 5, fontWeight: 600,
      color: diff > 0 ? t.accent.pos : t.accent.neg,
    }}>
      {diff > 0 ? '+' : '−'}{Math.abs(pct)}%
    </span>
  )
}

// ─── 스켈레톤 ─────────────────────────────────────────────────────────────────

function Skeleton({ mobile }: { mobile: boolean }) {
  const pulse = { borderRadius: t.radius.sm, background: t.neutrals.inner, animation: 'pulse 1.5s ease-in-out infinite' } as const
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: 8 }}>
        {[0, 1, 2, 3, 4, 5].map(i => <div key={i} style={{ ...pulse, height: 64 }} />)}
      </div>
      <div style={{ ...pulse, height: 132 }} />
      <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'repeat(3, 1fr)', gap: 8 }}>
        {[0, 1, 2].map(i => <div key={i} style={{ ...pulse, height: 168 }} />)}
      </div>
    </div>
  )
}

// ─── 본체 ─────────────────────────────────────────────────────────────────────

export interface SearchDemandCardProps {
  /** Umami 사이트 키 — /api/umami/search-demand?site= 와 동일 */
  site: UmamiSiteKey
}
export function SearchDemandCard({ site }: SearchDemandCardProps) {
  const mobile = useIsMobile()
  const dashCols = useDashCols()
  const [days, setDays] = useState<Period>(30)
  const [data, setData] = useState<SearchDemandStats | null>(null)
  const [gsc, setGsc] = useState<SearchConsoleStats | null>(null)
  const [index, setIndex] = useState<IndexStatusSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [gscError, setGscError] = useState<string | null>(null)

  const load = useCallback(async (period: Period, refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true)
    setError(null)
    setGscError(null)

    // 새로고침은 서버 캐시(10~30분)를 건너뛰도록 알린다
    const bust = refresh ? '&refresh=1' : ''

    // 세 소스는 독립 — 한쪽이 죽어도 나머지 섹션은 그대로 보여준다.
    const umamiP = fetch(`/api/umami/search-demand?site=${site}&days=${period}${bust}`)
      .then(async res => {
        const json = await res.json()
        if (!res.ok) throw new Error(json?.message || `조회 실패 (${res.status})`)
        setData(json as SearchDemandStats)
      })
      .catch(err => {
        console.error('[search-demand] umami load error:', err)
        setError(err instanceof Error ? err.message : String(err))
      })

    const gscP = fetch(`/api/gsc/search-analytics?site=${site}&days=${period}${bust}`)
      .then(async res => {
        const json = await res.json()
        if (!res.ok) throw new Error(json?.message || `조회 실패 (${res.status})`)
        setGsc(json as SearchConsoleStats)
      })
      .catch(err => {
        console.error('[search-demand] gsc load error:', err)
        setGsc(null)
        setGscError(err instanceof Error ? err.message : String(err))
      })

    // 색인 상태는 크론이 적재한 스냅샷 조회 — 실패해도 나머지는 그대로 보여준다
    const indexP = fetch(`/api/seo/index-status?site=${site}&days=30`)
      .then(async res => {
        const json = await res.json()
        if (!res.ok) throw new Error(json?.message || `조회 실패 (${res.status})`)
        setIndex(json as IndexStatusSummary)
      })
      .catch(err => {
        console.error('[search-demand] index status load error:', err)
        setIndex(null)
      })

    await Promise.all([umamiP, gscP, indexP])
    setLoading(false)
    setRefreshing(false)
  }, [site])

  useEffect(() => { load(days) }, [load, days])

  // 2열 모드: 두 섹션을 좌(Search Console) / 우(Umami)로 나란히.
  // 1열 모드: 섹션은 위아래 전폭이고, 섹션 안에서 좌 차트 · 우 지표 6장으로 쪼갠다
  //           (인사이트 섹션과 같은 분할).
  const sideBySide = !mobile && dashCols === 2
  const splitLayout = !mobile && dashCols === 1
  const statCols = mobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)'
  // 목록 패널: 1열 모드는 한 줄에 3개, 2열 모드는 2개, 모바일은 1개.
  const panelCols = mobile ? '1fr' : splitLayout ? 'repeat(3, minmax(0,1fr))' : 'repeat(2, minmax(0,1fr))'
  // 두 섹션 다 패널이 4장뿐 — 1열 모드에서는 한 줄에 다 넣는다.
  const wideCols = splitLayout ? 'repeat(4, minmax(0,1fr))' : panelCols
  const cov = data?.coverage
  // GSC(노출·클릭)와 Umami(실제 진입)를 경로로 잇는다. 양쪽 다 normalizePath를 거쳐
  // 같은 표기라 그대로 조인된다. 구글 클릭 대비 진입이 크게 모자라면 봇·차단·즉시이탈 구간.
  const umamiSearchByPath = useMemo(() => {
    const m = new Map<string, number>()
    if (!data) return m
    for (const p of data.searchPages) m.set(p.path, p.searchViews)
    for (const p of data.entryPages) if (!m.has(p.path)) m.set(p.path, p.searchViews)
    return m
  }, [data])

  const periodToggle = (
    <div style={{ display: 'flex', gap: 2, background: t.neutrals.inner, borderRadius: t.radius.sm, padding: 2 }}>
      {PERIODS.map(p => (
        <button key={p} onClick={() => setDays(p)}
          style={{
            ...mono(9.5), padding: '3px 7px', borderRadius: 3, border: 'none', cursor: 'pointer',
            background: days === p ? t.neutrals.card : 'transparent',
            color: days === p ? t.neutrals.text : t.neutrals.subtle,
            fontWeight: days === p ? 600 : 400,
          }}>
          {p}일
        </button>
      ))}
    </div>
  )

  const refreshBtn = (
    <button onClick={() => load(days, true)} disabled={refreshing}
      style={{
        width: 28, height: 28, borderRadius: t.radius.sm, background: t.neutrals.inner,
        border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: t.neutrals.muted, opacity: refreshing ? 0.5 : 1,
      }}>
      <LIcon name="refresh" size={13} stroke={1.8} />
    </button>
  )

  const linkBtn = (href: string, label: React.ReactNode, title: string) => (
    <a href={href} target="_blank" rel="noopener noreferrer" title={title}
      style={{
        ...mono(9.5), height: 28, minWidth: 28, padding: '0 8px', borderRadius: t.radius.sm,
        background: t.neutrals.inner, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: t.neutrals.muted, textDecoration: 'none',
      }}>
      {label}
    </a>
  )

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: sideBySide ? 'minmax(0,1fr) minmax(0,1fr)' : '1fr',
      gap: 14, alignItems: 'start',
    }}>

      {/* ── 섹션 1: 검색 노출 → 클릭 (Search Console) — 수요가 있는지, 그중 얼마를 잡는지 ── */}
      <LCard pad={0}>
        <div style={{ padding: t.density.cardPad, paddingBottom: 12 }}>
          <LSectionHead
            eyebrow="SEARCH CONSOLE"
            title="검색 노출 → 클릭"
            meta={gsc ? `${gsc.range.startDate} ~ ${gsc.range.endDate} · 구글 집계 ${gsc.range.lagDays}일 지연` : undefined}
            action={
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {periodToggle}
                {gsc && linkBtn(gsc.site.consoleUrl, 'GSC', 'Search Console')}
                {refreshBtn}
              </div>
            }
          />

          {gscError && (
            <div style={{
              padding: '8px 12px', borderRadius: t.radius.md, marginBottom: 10,
              background: tonePalettes.warn.bg, color: tonePalettes.warn.fg,
              fontSize: 'calc(10.5px * var(--fz, 1))', wordBreak: 'keep-all' as const, lineHeight: 1.6,
            }}>
              Search Console 조회 실패 — {gscError}
            </div>
          )}

          {loading && <Skeleton mobile={mobile} />}

          {!loading && gsc && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* 1열 모드: 좌 차트(전체 높이) · 우 지표 6장(3열). 그 외에는 지표 먼저, 차트는 아래 전폭. */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: splitLayout ? 'minmax(0,1fr) minmax(0,1fr)' : '1fr',
                gap: 8, alignItems: 'stretch',
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: statCols, gap: 8, alignContent: 'start' }}>
                  <LStat
                    label="노출"
                    value={gsc.totals.impressions.toLocaleString()}
                    valueExtra={<Delta now={gsc.totals.impressions} prev={gsc.previous.impressions} />}
                    sub="검색 결과에 보여진 횟수"
                    title="검색 결과에 우리 페이지가 노출된 횟수. 이 숫자가 작으면 애초에 수요와 연결되는 콘텐츠가 없다는 뜻이고, 크면 수요는 있는데 클릭에서 새고 있는지 봐야 한다."
                    sparkline={mobile ? undefined : cumulative(gsc.daily.map(d => ({ date: d.date, value: d.impressions })))}
                  />
                  <LStat
                    label="클릭"
                    value={gsc.totals.clicks.toLocaleString()}
                    valueExtra={<Delta now={gsc.totals.clicks} prev={gsc.previous.clicks} />}
                    sub={`노출 대비 CTR ${gsc.totals.ctr}%`}
                    tone={gsc.totals.clicks > 0 ? 'pos' : 'default'}
                    title="검색 결과에서 실제로 눌린 횟수. 노출 대비 이 값이 곧 '수요를 잡은 비율'."
                    sparkline={mobile ? undefined : cumulative(gsc.daily.map(d => ({ date: d.date, value: d.clicks })))}
                  />
                  <LStat
                    label="평균 게재순위"
                    value={gsc.totals.position > 0 ? String(gsc.totals.position) : '—'}
                    unit="위"
                    sub={gsc.previous.position > 0 ? `직전 기간 ${gsc.previous.position}위` : '직전 기간 데이터 없음'}
                    tone={gsc.totals.position > 0 && gsc.totals.position <= 10 ? 'pos' : 'default'}
                    title="노출 가중 평균 순위. 10위 안이면 첫 페이지, 11~30위면 사실상 안 보이는 자리다."
                  />
                  <LStat
                    label="색인율"
                    value={index && index.total > 0 ? `${index.indexedPct}%` : '—'}
                    valueExtra={index && index.changeFromPrev ? (
                      <span style={{
                        ...mono(9.5), marginLeft: 5, fontWeight: 600,
                        color: index.changeFromPrev > 0 ? t.accent.pos : t.accent.neg,
                      }}>
                        {index.changeFromPrev > 0 ? '+' : '−'}{Math.abs(index.changeFromPrev)}쪽
                      </span>
                    ) : undefined}
                    sub={index && index.total > 0
                      ? `${index.total.toLocaleString()}쪽 중 ${index.buckets.indexed.toLocaleString()}쪽 색인`
                      : '검사 기록 없음'}
                    tone={index && index.indexedPct >= 50 ? 'pos' : index && index.total > 0 ? 'warn' : 'default'}
                    title="URL 검사 API로 매일 전수 확인한 색인 비율. 노출·클릭보다 앞단이라, 여기가 낮으면 아래 지표는 볼 필요도 없다."
                    sparkline={mobile ? undefined : index?.trend.map(d => ({ date: d.date, value: d.indexed }))}
                  />
                  <LStat
                    label="노출된 콘텐츠"
                    value={gsc.capture.sitemapContents > 0 ? `${gsc.capture.impressedPct}%` : '—'}
                    sub={gsc.capture.sitemapContents > 0
                      ? `발행 ${gsc.capture.sitemapContents.toLocaleString()}개 중 ${gsc.capture.impressedContents.toLocaleString()}개 노출`
                      : '사이트맵 없음'}
                    tone={gsc.capture.impressedPct >= 50 ? 'pos' : gsc.capture.impressedPct < 20 ? 'warn' : 'default'}
                    title="발행한 콘텐츠 중 검색 결과에 한 번이라도 노출된 비율. 낮으면 색인이 안 됐거나 어떤 검색어에도 걸리지 않는 것."
                  />
                  <LStat
                    label="클릭된 콘텐츠"
                    value={gsc.capture.sitemapContents > 0 ? `${gsc.capture.clickedPct}%` : '—'}
                    sub={gsc.capture.sitemapContents > 0
                      ? `노출 ${gsc.capture.impressedContents.toLocaleString()}개 중 ${gsc.capture.clickedContents.toLocaleString()}개 클릭`
                      : '—'}
                    tone={gsc.capture.clickedPct > 0 ? 'default' : 'warn'}
                    title="발행 콘텐츠 중 실제 클릭을 받아본 비율. 노출 비율과의 간격이 곧 '보여는 주는데 안 눌리는' 구간."
                  />
                </div>
                {splitLayout && <GscTrendCard daily={gsc.daily} />}
              </div>

              {!splitLayout && <GscTrendCard daily={gsc.daily} />}

              <div style={{ display: 'grid', gridTemplateColumns: wideCols, gap: 8, alignItems: 'stretch' }}>
                {/* 색인 → 노출 → 클릭 순서로 읽히게 배치 */}
                {index && <IndexStatusCard data={index} />}
                {index && <IndexGroupsCard data={index} />}
                <DataTable
                  title="검색어"
                  minWidth={330}
                  columns={[
                    { key: 'q', label: '검색어', width: 'minmax(110px,1fr)' },
                    { key: 'imp', label: '노출', width: '46px', align: 'right' as const },
                    { key: 'clk', label: '클릭', width: '40px', align: 'right' as const },
                    { key: 'ctr', label: 'CTR', width: '46px', align: 'right' as const },
                    { key: 'pos', label: '순위', width: '46px', align: 'right' as const },
                  ]}
                  rows={gsc.queries.map(q => ({
                    key: q.query,
                    cells: [q.query, q.impressions.toLocaleString(), q.clicks.toLocaleString(), `${q.ctr}%`, `${q.position}위`],
                    sort: [q.query, q.impressions, q.clicks, q.ctr, q.position],
                  }))}
                  empty="기간 내 검색어 데이터가 없습니다"
                />
                <DataTable
                  title="노출 상위 페이지"
                  minWidth={366}
                  columns={[
                    { key: 'path', label: '경로', width: 'minmax(120px,1fr)' },
                    { key: 'imp', label: '노출', width: '46px', align: 'right' as const },
                    { key: 'clk', label: '클릭', width: '40px', align: 'right' as const },
                    { key: 'in', label: '진입', width: '40px', align: 'right' as const },
                    { key: 'pos', label: '순위', width: '46px', align: 'right' as const },
                  ]}
                  rows={gsc.pages.map(p => {
                    // 진입은 Umami 기준 검색 유입. 데이터가 아직 없으면 비교 자체를 못 하므로 —
                    const visits = data ? (umamiSearchByPath.get(p.path) ?? 0) : null
                    return {
                      key: p.path,
                      href: `https://${gsc.site.domain}${p.path}`,
                      cells: [
                        p.path, p.impressions.toLocaleString(), p.clicks.toLocaleString(),
                        visits == null ? '—' : visits.toLocaleString(),
                        `${p.position}위`,
                      ],
                      sort: [p.path, p.impressions, p.clicks, visits ?? -1, p.position],
                    }
                  })}
                  empty="노출된 페이지가 없습니다"
                />
              </div>
            </div>
          )}
        </div>
      </LCard>

      {/* ── 섹션 2: 진입 후 행동 (Umami) — 잡은 수요가 사이트 안에서 어떻게 되는지 ── */}
      <LCard pad={0}>
        <div style={{ padding: t.density.cardPad, paddingBottom: 12 }}>
          <LSectionHead
            eyebrow="UMAMI"
            title="진입 후 행동"
            meta={data ? `최근 ${data.range.days}일 · 자기 방문 미제외` : undefined}
            action={
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {periodToggle}
                {data && linkBtn(data.site.umamiUrl, <LIcon name="trending" size={13} stroke={1.8} />, 'Umami')}
                {refreshBtn}
              </div>
            }
          />

          {error && (
            <div style={{
              padding: '8px 12px', borderRadius: t.radius.md, marginBottom: 10,
              background: tonePalettes.neg.bg, color: tonePalettes.neg.fg,
              fontSize: 'calc(11px * var(--fz, 1))', wordBreak: 'keep-all' as const, lineHeight: 1.5,
            }}>
              {error}
            </div>
          )}

          {loading && <Skeleton mobile={mobile} />}

          {!loading && data && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: splitLayout ? 'minmax(0,1fr) minmax(0,1fr)' : '1fr',
                gap: 8, alignItems: 'stretch',
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: statCols, gap: 8, alignContent: 'start' }}>
                  <LStat
                    label="검색 유입"
                    value={data.search.visits.toLocaleString()}
                    unit="세션"
                    sub={`전체 유입의 ${data.search.share}%`}
                    tone={data.search.share >= 30 ? 'pos' : 'default'}
                    title="검색엔진·AI 답변 리퍼러로 들어온 세션. Umami는 검색어를 받지 못하므로 리퍼러 호스트 기준이다."
                    sparkline={mobile ? undefined : cumulative(data.daily.map(d => ({ date: d.date, value: d.searchSessions })))}
                  />
                  <LStat
                    label="콘텐츠 커버리지"
                    value={cov && cov.sitemapContents > 0 ? `${cov.contentPct}%` : '—'}
                    sub={cov && cov.sitemapContents > 0
                      ? `발행 ${cov.sitemapContents.toLocaleString()}개 중 ${cov.touchedContents.toLocaleString()}개에 유입`
                      : '사이트맵 없음'}
                    tone={cov && cov.contentPct >= 50 ? 'pos' : cov && cov.contentPct < 20 ? 'warn' : 'default'}
                    title="sitemap.xml의 발행 콘텐츠(로케일 변형은 하나로 묶음) 중 기간 내 유입이 1회 이상 붙은 비율. 낮으면 만든 페이지가 수요와 연결되지 않고 있다는 뜻."
                  />
                  <LStat
                    label="검색 진입 페이지"
                    value={cov ? cov.searchTouchedPages.toLocaleString() : '—'}
                    unit="쪽"
                    sub={cov && cov.sitemapPages > 0 ? `발행 ${cov.sitemapPages.toLocaleString()}쪽 중 ${cov.searchPct}%` : '—'}
                    tone={cov && cov.searchTouchedPages > 0 ? 'default' : 'warn'}
                    title="검색·AI 리퍼러로 최소 1회 진입이 발생한 페이지 수. 이 숫자가 곧 '수요를 실제로 잡고 있는 문(門)'의 개수."
                  />
                  <LStat
                    label="검색 이탈률"
                    value={data.search.visits > 0 ? `${data.search.bounceRate}%` : '—'}
                    sub={`전체 이탈 ${data.totals.bounceRate}% · 체류 ${fmtDuration(data.search.avgSeconds)}`}
                    tone={data.search.visits > 0 && data.search.bounceRate > 70 ? 'neg' : 'default'}
                    title="검색으로 들어온 세션이 한 페이지만 보고 나간 비율. 높으면 유입은 잡았지만 페이지가 의도에 답하지 못한 것."
                  />
                  <LStat
                    label="방문자"
                    value={data.totals.visitors.toLocaleString()}
                    sub={`세션 ${data.totals.visits.toLocaleString()} · 페이지뷰 ${data.totals.pageviews.toLocaleString()}`}
                    sparkline={mobile ? undefined : cumulative(data.daily.map(d => ({ date: d.date, value: d.sessions })))}
                    title="기간 내 고유 방문자. 자기 방문(관리자·개발 브라우저)은 Umami에서 제외되지 않으니 초기 수치는 감안할 것."
                  />
                  <LStat
                    label="세션 깊이"
                    value={String(data.totals.viewsPerVisit)}
                    unit="쪽/세션"
                    sub={`평균 체류 ${fmtDuration(data.totals.avgSeconds)}`}
                    title="세션당 평균 페이지뷰. 진입 후 사이트 안에서 다음 수요로 이어지는지를 본다."
                  />
                </div>
                {splitLayout && <TrafficTrendCard daily={data.daily} />}
              </div>

              {!splitLayout && <TrafficTrendCard daily={data.daily} />}

              <div style={{ display: 'grid', gridTemplateColumns: wideCols, gap: 8, alignItems: 'stretch' }}>
                <DataTable
                  title="검색 진입 페이지"
                  minWidth={300}
                  columns={[
                    { key: 'path', label: '경로', width: 'minmax(120px,1fr)' },
                    { key: 'in', label: '진입', width: '46px', align: 'right' as const },
                    { key: 'all', label: '전체', width: '46px', align: 'right' as const },
                  ]}
                  rows={data.searchPages.map(p => ({
                    key: p.path,
                    href: `https://${data.site.domain}${p.path}`,
                    cells: [p.path, p.searchViews.toLocaleString(), p.views.toLocaleString()],
                    sort: [p.path, p.searchViews, p.views],
                  }))}
                  empty={<>검색 진입 기록이 없습니다<br />색인 상태부터 확인 필요</>}
                />
                <ChannelMixCard data={data} />
                <DataTable
                  title="조회 상위 페이지"
                  minWidth={320}
                  columns={[
                    { key: 'path', label: '경로', width: 'minmax(120px,1fr)' },
                    { key: 'pv', label: '페이지뷰', width: '58px', align: 'right' as const },
                    { key: 'last', label: '마지막', width: '58px', align: 'right' as const },
                  ]}
                  rows={data.entryPages.map(p => ({
                    key: p.path,
                    href: `https://${data.site.domain}${p.path}`,
                    cells: [p.path, p.views.toLocaleString(), fmtAgo(p.lastViewedAt)],
                    // 최근일수록 위로 오게 시각 자체로 정렬한다(포맷 문자열로 정렬하면 뒤엉킨다)
                    sort: [p.path, p.views, p.lastViewedAt ? new Date(p.lastViewedAt).getTime() : 0],
                  }))}
                  empty="조회 기록이 없습니다"
                />
                <RegionLanguageCard data={data} />
              </div>

              <div style={{
                fontSize: 'calc(9.5px * var(--fz, 1))', color: t.neutrals.subtle,
                lineHeight: 1.6, wordBreak: 'keep-all' as const,
              }}>
                {data.notes.map((n, i) => <div key={i}>· {n}</div>)}
                {cov && cov.orphanPaths.length > 0 && (
                  <div>· 사이트맵에 없는데 유입이 잡힌 경로 {cov.orphanPaths.length}개 (예: {cov.orphanPaths.slice(0, 3).join(', ')})</div>
                )}
              </div>
            </div>
          )}
        </div>
      </LCard>
    </div>
  )
}
