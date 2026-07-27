'use client'

// 검색 수요 포착 카드 (Umami) — 보이스카드/리뷰노트 페이지 최상단 공용.
//
// 방문자 수를 보는 카드가 아니다. "발행한 페이지가 검색 수요를 실제로 잡고 있는가"를 세 층으로 본다.
//   1) 유입 채널  — 검색이 유입의 몇 %인가
//   2) 커버리지   — 사이트맵 발행 콘텐츠 중 유입이 붙은 비율 / 노는 콘텐츠
//   3) 진입 후    — 검색 진입 세션의 이탈률·체류 (수요는 잡았는데 새는지)
// 키워드 단위 수요는 Umami가 리퍼러까지만 주므로 보이지 않는다(카드 하단에 명시).

import { useCallback, useEffect, useState } from 'react'
import { t, tonePalettes, useIsMobile } from './linear-tokens'
import { LCard } from './linear-card'
import { LSectionHead } from './linear-section-head'
import { LStat } from './linear-stat'
import { LIcon } from './linear-icons'
import type { SearchDemandStats, Channel } from '@/lib/umami'
import type { SearchConsoleStats } from '@/lib/gsc'

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

const panelStyle: React.CSSProperties = {
  background: t.neutrals.inner, borderRadius: t.radius.sm,
  padding: '8px 10px', height: '100%', boxSizing: 'border-box',
  display: 'flex', flexDirection: 'column', minWidth: 0,
}

const panelTitle: React.CSSProperties = {
  ...mono(9.5), letterSpacing: 0.8, textTransform: 'uppercase' as const,
  color: t.neutrals.subtle, whiteSpace: 'nowrap' as const,
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      flex: 1, minHeight: 60, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 'calc(10px * var(--fz, 1))', color: t.neutrals.subtle, textAlign: 'center' as const,
      wordBreak: 'keep-all' as const, lineHeight: 1.5, padding: '0 4px',
    }}>
      {children}
    </div>
  )
}

// ─── 일별 추이 (검색 세션 vs 그 외 + 페이지뷰 라인) ───────────────────────────

function TrafficTrendCard({ daily }: { daily: SearchDemandStats['daily'] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const rows = daily ?? []
  const maxSessions = rows.reduce((m, r) => Math.max(m, r.sessions), 0)
  const maxPv = rows.reduce((m, r) => Math.max(m, r.pageviews), 0)
  const barPct = (v: number) => (maxSessions > 0 ? (v / maxSessions) * 100 : 0)
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

// ─── 페이지 목록 (검색 진입 / 전체 진입) ──────────────────────────────────────

function PageListCard({
  title, rows, valueLabel, empty, domain,
}: {
  title: string
  rows: Array<{ path: string; primary: number; secondary?: string }>
  valueLabel: string
  empty: React.ReactNode
  domain: string
}) {
  const max = rows.reduce((m, r) => Math.max(m, r.primary), 0)
  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 6 }}>
        <div style={panelTitle}>{title}</div>
        <div style={{ ...mono(9), color: t.neutrals.subtle, whiteSpace: 'nowrap' as const }}>{valueLabel}</div>
      </div>
      {rows.length === 0 ? <EmptyLine>{empty}</EmptyLine> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {rows.map(r => (
            <a key={r.path}
              href={`https://${domain}${r.path}`}
              target="_blank" rel="noopener noreferrer"
              style={{
                display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', alignItems: 'center', gap: 8,
                position: 'relative', padding: '3px 5px', borderRadius: t.radius.sm,
                textDecoration: 'none', color: 'inherit', overflow: 'hidden',
              }}>
              <span style={{
                position: 'absolute', left: 0, top: 0, bottom: 0,
                width: `${max > 0 ? (r.primary / max) * 100 : 0}%`,
                background: SEARCH_COLOR, opacity: 0.1, borderRadius: t.radius.sm,
              }} />
              <span style={{
                position: 'relative', fontSize: 'calc(10px * var(--fz, 1))', color: t.neutrals.text,
                whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0,
              }}>
                {r.path}
              </span>
              <span style={{ position: 'relative', display: 'flex', alignItems: 'baseline', gap: 5, whiteSpace: 'nowrap' as const }}>
                {r.secondary && <span style={{ ...mono(9), color: t.neutrals.subtle }}>{r.secondary}</span>}
                <span style={{ ...mono(10), color: t.neutrals.text, fontWeight: 600 }}>{r.primary.toLocaleString()}</span>
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── 채널 믹스 ────────────────────────────────────────────────────────────────

function ChannelMixCard({ data }: { data: SearchDemandStats }) {
  const channels = data.channels
  const total = channels.reduce((s, c) => s + c.visits, 0)
  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 6 }}>
        <div style={panelTitle}>유입 채널</div>
        <div style={{ ...mono(9), color: t.neutrals.subtle }}>세션 {total.toLocaleString()}</div>
      </div>
      {total === 0 ? <EmptyLine>아직 유입이 없습니다</EmptyLine> : (
        <>
          <div style={{ display: 'flex', height: 8, borderRadius: 2, overflow: 'hidden', marginBottom: 8 }}>
            {channels.map(c => (
              <div key={c.channel} title={`${CHANNEL_LABEL[c.channel]} ${c.share}%`}
                style={{ width: `${c.share}%`, background: CHANNEL_COLOR[c.channel] }} />
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 10px', marginBottom: 8 }}>
            {channels.map(c => (
              <span key={c.channel} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, ...mono(9.5), color: t.neutrals.muted }}>
                <span style={{ width: 6, height: 6, borderRadius: 1, background: CHANNEL_COLOR[c.channel] }} />
                {CHANNEL_LABEL[c.channel]} {c.visits.toLocaleString()}
                <span style={{ color: t.neutrals.subtle }}>({c.share}%)</span>
              </span>
            ))}
          </div>
          <div style={{ ...mono(9), letterSpacing: 0.6, textTransform: 'uppercase' as const, color: t.neutrals.subtle, marginBottom: 4 }}>
            검색 리퍼러
          </div>
          {data.search.referrers.length === 0 ? (
            <div style={{ fontSize: 'calc(10px * var(--fz, 1))', color: t.neutrals.subtle }}>
              검색엔진 유입 기록 없음
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {data.search.referrers.slice(0, 6).map(r => (
                <div key={r.host} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 'calc(10px * var(--fz, 1))', color: t.neutrals.text }}>
                  <span style={{ whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.host}
                    {r.channel === 'ai' && (
                      <span style={{ ...mono(8.5), marginLeft: 4, padding: '1px 4px', borderRadius: 3, background: tonePalettes.brand.bg, color: tonePalettes.brand.fg }}>AI</span>
                    )}
                  </span>
                  <span style={{ ...mono(10), color: t.neutrals.muted }}>{r.visits.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── 미포착 콘텐츠 ────────────────────────────────────────────────────────────

function IdleContentCard({ data, domain }: { data: SearchDemandStats; domain: string }) {
  const cov = data.coverage
  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 6 }}>
        <div style={panelTitle}>유입 0 콘텐츠</div>
        <div style={{ ...mono(9), color: t.neutrals.subtle }}>
          {cov.sitemapContents > 0 ? `${cov.idleContents.toLocaleString()} / ${cov.sitemapContents.toLocaleString()}` : '사이트맵 없음'}
        </div>
      </div>
      {cov.sitemapContents === 0 ? (
        <EmptyLine>사이트맵을 읽지 못해 커버리지를 계산하지 못했습니다</EmptyLine>
      ) : cov.idleSample.length === 0 ? (
        <EmptyLine>발행 콘텐츠 전부에 유입이 있습니다</EmptyLine>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {cov.idleSample.map(p => (
              <a key={p} href={`https://${domain}${p}`} target="_blank" rel="noopener noreferrer"
                style={{
                  ...mono(9.5), padding: '2px 6px', borderRadius: t.radius.sm,
                  background: t.neutrals.card, color: t.neutrals.muted, textDecoration: 'none',
                  maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
                }}>
                {p}
              </a>
            ))}
          </div>
          <div style={{ fontSize: 'calc(9.5px * var(--fz, 1))', color: t.neutrals.subtle, marginTop: 6, lineHeight: 1.5, wordBreak: 'keep-all' as const }}>
            발행은 됐지만 기간 내 유입이 한 번도 없던 콘텐츠 표본입니다. 색인 여부·검색어 매칭을 먼저 확인할 대상.
          </div>
        </>
      )}
    </div>
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
                <div style={{
                  height: `${(r.impressions / maxImp) * 100}%`, background: IMPRESSION_COLOR,
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
                bottom: `calc(${((r.impressions / maxImp) * 100).toFixed(1)}% + 8px)`, pointerEvents: 'none', zIndex: 10,
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

// ─── Search Console: 검색어 목록 ──────────────────────────────────────────────

const REASON_LABEL = { page_two: '2페이지권', low_ctr: 'CTR 저조' } as const

function QueryListCard({
  title, hint, rows, empty, showReason,
}: {
  title: string
  hint?: string
  rows: Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number; reason?: 'low_ctr' | 'page_two' }>
  empty: React.ReactNode
  showReason?: boolean
}) {
  const max = rows.reduce((m, r) => Math.max(m, r.impressions), 0)
  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 6 }}>
        <div style={panelTitle}>{title}</div>
        <div style={{ ...mono(9), color: t.neutrals.subtle, whiteSpace: 'nowrap' as const }}>노출 · 클릭 · CTR · 순위</div>
      </div>
      {hint && (
        <div style={{ fontSize: 'calc(9.5px * var(--fz, 1))', color: t.neutrals.subtle, marginBottom: 6, lineHeight: 1.5, wordBreak: 'keep-all' as const }}>
          {hint}
        </div>
      )}
      {rows.length === 0 ? <EmptyLine>{empty}</EmptyLine> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {rows.map(r => (
            <div key={r.query + r.position} style={{
              display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', alignItems: 'center', gap: 8,
              position: 'relative', padding: '3px 5px', borderRadius: t.radius.sm, overflow: 'hidden',
            }}>
              <span style={{
                position: 'absolute', left: 0, top: 0, bottom: 0,
                width: `${max > 0 ? (r.impressions / max) * 100 : 0}%`,
                background: CLICK_COLOR, opacity: 0.1, borderRadius: t.radius.sm,
              }} />
              <span style={{
                position: 'relative', fontSize: 'calc(10px * var(--fz, 1))', color: t.neutrals.text,
                whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0,
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.query}</span>
                {showReason && r.reason && (
                  <span style={{
                    ...mono(8.5), flexShrink: 0, padding: '1px 4px', borderRadius: 3,
                    background: r.reason === 'page_two' ? tonePalettes.warn.bg : tonePalettes.info.bg,
                    color: r.reason === 'page_two' ? tonePalettes.warn.fg : tonePalettes.info.fg,
                  }}>
                    {REASON_LABEL[r.reason]}
                  </span>
                )}
              </span>
              <span style={{ position: 'relative', display: 'flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap' as const, ...mono(9.5) }}>
                <span style={{ color: t.neutrals.text, fontWeight: 600 }}>{r.impressions.toLocaleString()}</span>
                <span style={{ color: t.neutrals.muted }}>{r.clicks.toLocaleString()}</span>
                <span style={{ color: t.neutrals.subtle }}>{r.ctr}%</span>
                <span style={{ color: t.neutrals.subtle }}>{r.position}위</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── 밴드 헤더 ────────────────────────────────────────────────────────────────

function BandHead({ label, hint, right }: { label: string; hint?: string; right?: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      gap: 8, marginTop: 4, marginBottom: 2, flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
        <span style={{
          ...mono(10), letterSpacing: 1, textTransform: 'uppercase' as const,
          color: t.neutrals.text, fontWeight: 600,
        }}>
          {label}
        </span>
        {hint && (
          <span style={{ fontSize: 'calc(9.5px * var(--fz, 1))', color: t.neutrals.subtle, wordBreak: 'keep-all' as const }}>
            {hint}
          </span>
        )}
      </div>
      {right}
    </div>
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
  site: 'voicecards' | 'reviewnotes'
}

export function SearchDemandCard({ site }: SearchDemandCardProps) {
  const mobile = useIsMobile()
  const [days, setDays] = useState<Period>(30)
  const [data, setData] = useState<SearchDemandStats | null>(null)
  const [gsc, setGsc] = useState<SearchConsoleStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [gscError, setGscError] = useState<string | null>(null)

  const load = useCallback(async (period: Period, refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true)
    setError(null)
    setGscError(null)

    // Umami(진입 후)와 GSC(노출·클릭)는 독립 — 한쪽이 죽어도 다른 쪽은 보여준다.
    const umamiP = fetch(`/api/umami/search-demand?site=${site}&days=${period}`)
      .then(async res => {
        const json = await res.json()
        if (!res.ok) throw new Error(json?.message || `조회 실패 (${res.status})`)
        setData(json as SearchDemandStats)
      })
      .catch(err => {
        console.error('[search-demand] umami load error:', err)
        setError(err instanceof Error ? err.message : String(err))
      })

    const gscP = fetch(`/api/gsc/search-analytics?site=${site}&days=${period}`)
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

    await Promise.all([umamiP, gscP])
    setLoading(false)
    setRefreshing(false)
  }, [site])

  useEffect(() => { load(days) }, [load, days])

  // 이 카드는 대시보드 열 설정과 무관하게 항상 전폭으로 놓이므로, 내부 패널 배치는 뷰포트만 본다.
  const wide = !mobile
  const cov = data?.coverage
  const listCols = wide ? 'repeat(3, minmax(0,1fr))' : '1fr'

  return (
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: 12 }}>
        <LSectionHead
          eyebrow="WEB · SEARCH"
          title="검색 수요 포착"
          action={
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
              {gsc && (
                <a href={gsc.site.consoleUrl} target="_blank" rel="noopener noreferrer" title="Search Console"
                  style={{
                    ...mono(9.5), height: 28, padding: '0 8px', borderRadius: t.radius.sm,
                    background: t.neutrals.inner, display: 'flex', alignItems: 'center',
                    color: t.neutrals.muted, textDecoration: 'none',
                  }}>
                  GSC
                </a>
              )}
              {data && (
                <a href={data.site.umamiUrl} target="_blank" rel="noopener noreferrer" title="Umami"
                  style={{
                    width: 28, height: 28, borderRadius: t.radius.sm, background: t.neutrals.inner,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: t.neutrals.muted, textDecoration: 'none',
                  }}>
                  <LIcon name="trending" size={13} stroke={1.8} />
                </a>
              )}
              <button onClick={() => load(days, true)} disabled={refreshing}
                style={{
                  width: 28, height: 28, borderRadius: t.radius.sm, background: t.neutrals.inner,
                  border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: t.neutrals.muted, opacity: refreshing ? 0.5 : 1,
                }}>
                <LIcon name="refresh" size={13} stroke={1.8} />
              </button>
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

        {!loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

            {/* ── 밴드 1: 검색 노출·클릭 (Search Console) — 수요가 있는지, 그중 얼마를 잡는지 ── */}
            <BandHead
              label="노출 → 클릭 · Search Console"
              hint={gsc ? `${gsc.range.startDate} ~ ${gsc.range.endDate} · 구글 집계 ${gsc.range.lagDays}일 지연` : undefined}
            />

            {gscError && (
              <div style={{
                padding: '8px 12px', borderRadius: t.radius.md,
                background: tonePalettes.warn.bg, color: tonePalettes.warn.fg,
                fontSize: 'calc(10.5px * var(--fz, 1))', wordBreak: 'keep-all' as const, lineHeight: 1.6,
              }}>
                Search Console 조회 실패 — {gscError}
              </div>
            )}

            {gsc && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: 8 }}>
                  <LStat
                    label="노출"
                    value={gsc.totals.impressions.toLocaleString()}
                    valueExtra={<Delta now={gsc.totals.impressions} prev={gsc.previous.impressions} />}
                    sub="구글이 우리 페이지를 보여준 횟수 = 존재하는 수요"
                    title="검색 결과에 우리 페이지가 노출된 횟수. 이 숫자가 작으면 애초에 수요와 연결되는 콘텐츠가 없다는 뜻이고, 크면 수요는 있는데 클릭에서 새고 있는지 봐야 한다."
                    sparkline={gsc.daily.map(d => ({ date: d.date, value: d.impressions }))}
                  />
                  <LStat
                    label="클릭"
                    value={gsc.totals.clicks.toLocaleString()}
                    valueExtra={<Delta now={gsc.totals.clicks} prev={gsc.previous.clicks} />}
                    sub={`노출 대비 CTR ${gsc.totals.ctr}%`}
                    tone={gsc.totals.clicks > 0 ? 'pos' : 'default'}
                    title="검색 결과에서 실제로 눌린 횟수. 노출 대비 이 값이 곧 '수요를 잡은 비율'."
                    sparkline={gsc.daily.map(d => ({ date: d.date, value: d.clicks }))}
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
                  <LStat
                    label="노출 0 콘텐츠"
                    value={gsc.capture.sitemapContents > 0 ? gsc.capture.invisibleCount.toLocaleString() : '—'}
                    unit="개"
                    sub="검색에 아예 안 나타나는 발행 콘텐츠"
                    tone={gsc.capture.invisibleCount > 0 ? 'warn' : 'pos'}
                    title="사이트맵에는 있는데 기간 내 노출이 0인 콘텐츠. 색인 여부(URL 검사)부터 확인할 1순위 목록."
                  />
                </div>

                <GscTrendCard daily={gsc.daily} />

                <div style={{ display: 'grid', gridTemplateColumns: wide ? 'repeat(2, minmax(0,1fr))' : '1fr', gap: 8, alignItems: 'stretch' }}>
                  <QueryListCard
                    title="검색어 (노출순)"
                    rows={gsc.queries}
                    empty="기간 내 검색어 데이터가 없습니다"
                  />
                  <QueryListCard
                    title="놓치고 있는 검색어"
                    hint="2페이지권(8~30위) = 순위만 올리면 잡히는 수요 / CTR 저조 = 상위인데 제목·설명이 의도에 못 답하는 경우"
                    rows={gsc.opportunities}
                    showReason
                    empty="개선 여지가 큰 검색어가 아직 없습니다"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: wide ? 'repeat(2, minmax(0,1fr))' : '1fr', gap: 8, alignItems: 'stretch' }}>
                  <PageListCard
                    title="노출 상위 페이지"
                    valueLabel="노출 · 클릭"
                    domain={gsc.site.domain}
                    rows={gsc.pages.map(p => ({
                      path: p.path,
                      primary: p.impressions,
                      secondary: `클릭 ${p.clicks} · ${p.position}위`,
                    }))}
                    empty="노출된 페이지가 없습니다"
                  />
                  <div style={panelStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 6 }}>
                      <div style={panelTitle}>검색에 안 나타나는 콘텐츠</div>
                      <div style={{ ...mono(9), color: t.neutrals.subtle }}>
                        {gsc.capture.sitemapContents > 0
                          ? `${gsc.capture.invisibleCount.toLocaleString()} / ${gsc.capture.sitemapContents.toLocaleString()}`
                          : '사이트맵 없음'}
                      </div>
                    </div>
                    {gsc.capture.invisibleSample.length === 0 ? (
                      <EmptyLine>발행 콘텐츠 전부가 검색에 노출되고 있습니다</EmptyLine>
                    ) : (
                      <>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {gsc.capture.invisibleSample.map(p => (
                            <a key={p} href={`https://${gsc.site.domain}${p}`} target="_blank" rel="noopener noreferrer"
                              style={{
                                ...mono(9.5), padding: '2px 6px', borderRadius: t.radius.sm,
                                background: t.neutrals.card, color: t.neutrals.muted, textDecoration: 'none',
                                maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
                              }}>
                              {p}
                            </a>
                          ))}
                        </div>
                        <div style={{ fontSize: 'calc(9.5px * var(--fz, 1))', color: t.neutrals.subtle, marginTop: 6, lineHeight: 1.5, wordBreak: 'keep-all' as const }}>
                          노출 0 = 구글이 어떤 검색어에도 이 페이지를 내보내지 않았다는 뜻. 색인 여부를 URL 검사로 먼저 확인할 대상.
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* ── 밴드 2: 진입 후 (Umami) — 잡은 수요가 사이트 안에서 어떻게 되는지 ── */}
            <BandHead
              label="진입 후 · Umami"
              hint={data ? `최근 ${data.range.days}일 · 자기 방문 미제외` : undefined}
            />

            {data && (
              <>
            {/* 핵심 지표 */}
            <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: 8 }}>
              <LStat
                label="검색 유입"
                value={data.search.visits.toLocaleString()}
                unit="세션"
                sub={`전체 유입의 ${data.search.share}%`}
                tone={data.search.share >= 30 ? 'pos' : 'default'}
                title="검색엔진·AI 답변 리퍼러로 들어온 세션. Umami는 검색어를 받지 못하므로 리퍼러 호스트 기준이다."
                sparkline={data.daily.map(d => ({ date: d.date, value: d.searchSessions }))}
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
                sparkline={data.daily.map(d => ({ date: d.date, value: d.sessions }))}
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

            {/* 일별 추이 */}
            <TrafficTrendCard daily={data.daily} />

            {/* 진입 페이지 · 채널 · 미포착 */}
            <div style={{ display: 'grid', gridTemplateColumns: listCols, gap: 8, alignItems: 'stretch' }}>
              <PageListCard
                title="검색 진입 페이지"
                valueLabel="진입"
                domain={data.site.domain}
                rows={data.searchPages.map(p => ({ path: p.path, primary: p.searchViews, secondary: `총 ${p.views}` }))}
                empty={<>검색 진입 기록이 없습니다<br />색인 상태부터 확인 필요</>}
              />
              <ChannelMixCard data={data} />
              <IdleContentCard data={data} domain={data.site.domain} />
            </div>

            {/* 전체 조회 상위 (검색 외 포함) */}
            <div style={{ display: 'grid', gridTemplateColumns: wide ? 'repeat(2, minmax(0,1fr))' : '1fr', gap: 8, alignItems: 'stretch' }}>
              <PageListCard
                title="조회 상위 페이지"
                valueLabel="페이지뷰"
                domain={data.site.domain}
                rows={data.entryPages.map(p => ({
                  path: p.path,
                  primary: p.views,
                  secondary: p.searchViews > 0 ? `검색 ${p.searchViews}` : undefined,
                }))}
                empty="조회 기록이 없습니다"
              />
              <div style={panelStyle}>
                <div style={{ ...panelTitle, marginBottom: 6 }}>지역 · 언어</div>
                {data.countries.length === 0 && data.languages.length === 0 ? (
                  <EmptyLine>기록 없음</EmptyLine>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,200px))', gap: 16, justifyContent: 'start' }}>
                    <div>
                      <div style={{ ...mono(9), color: t.neutrals.subtle, marginBottom: 4 }}>국가</div>
                      {data.countries.slice(0, 6).map(c => (
                        <div key={c.code} style={{ display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: 'calc(10px * var(--fz, 1))', color: t.neutrals.text }}>
                          <span>{c.code}</span>
                          <span style={{ ...mono(10), color: t.neutrals.muted }}>{c.visits.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                    <div>
                      <div style={{ ...mono(9), color: t.neutrals.subtle, marginBottom: 4 }}>브라우저 언어</div>
                      {data.languages.slice(0, 6).map(l => (
                        <div key={l.code} style={{ display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: 'calc(10px * var(--fz, 1))', color: t.neutrals.text }}>
                          <span>{l.code}</span>
                          <span style={{ ...mono(10), color: t.neutrals.muted }}>{l.visits.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ fontSize: 'calc(9.5px * var(--fz, 1))', color: t.neutrals.subtle, marginTop: 8, lineHeight: 1.5, wordBreak: 'keep-all' as const }}>
                  다국어 페이지를 발행한 언어와 실제 방문 언어가 어긋나면, 번역은 했지만 그 언어권 수요는 못 잡고 있다는 신호.
                </div>
              </div>
            </div>

            {/* 주석 */}
            <div style={{
              fontSize: 'calc(9.5px * var(--fz, 1))', color: t.neutrals.subtle,
              lineHeight: 1.6, wordBreak: 'keep-all' as const,
            }}>
              {data.notes.map((n, i) => <div key={i}>· {n}</div>)}
              {cov && cov.orphanPaths.length > 0 && (
                <div>· 사이트맵에 없는데 유입이 잡힌 경로 {cov.orphanPaths.length}개 (예: {cov.orphanPaths.slice(0, 3).join(', ')})</div>
              )}
            </div>
              </>
            )}
          </div>
        )}
      </div>
    </LCard>
  )
}
