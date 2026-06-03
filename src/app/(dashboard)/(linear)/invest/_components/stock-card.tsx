'use client'

import { memo, useState } from 'react'
import { t, tonePalettes } from '@/app/(dashboard)/_components/linear-tokens'

/* ── Types ── */

export interface PyramidingInfo {
  tranche: number
  avgReturnPct: number
  status: 'BUY' | 'HOLD' | 'FREEZE' | 'FULL'
  nextTriggerPct: number | null
  nextTriggerPrice: number | null
}

export interface MonitorInfo {
  stage: number
  changePct: number
  days: number
  nextThresholdPct: number | null
  nextThresholdPrice: number | null
  startDate: string
  startPrice: number
}

export interface StockCardData {
  name: string
  ticker: string
  sector: string
  axis?: string
  group: 'portfolio' | 'watchlist' | 'research'
  price?: number
  changePercent?: number
  currency?: string
  signal?: 'new_high' | 'near' | 'weak' | null
  gapFromHighPct?: number | null
  holdingQty?: number
  avgPrice?: number
  momentumScore?: number | null
  return1m?: number | null
  weightPct?: number
  pinned?: boolean
  pyramiding?: PyramidingInfo
  monitor?: MonitorInfo
  /** 6개월 모멘텀이 QLD보다 낮아 'QLD전환' 후보. */
  qldTransition?: boolean
  // Research-specific
  verdict?: string | null
  compositeScore?: number | null
  sourceType?: string
  researchId?: string
  marketCapLabel?: string
  structuralThesis?: string | null
  valueChainPosition?: string | null
}

/* ── Configs ── */

const SIGNAL_STYLE: Record<string, { label: string; bg: string; fg: string }> = {
  new_high: { label: '신고가', ...tonePalettes.done },
  near:     { label: '근접',  ...tonePalettes.warn },
  weak:     { label: '부진',  ...tonePalettes.info },
}

const PYRAMID_STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  BUY:         { label: '추매',   ...tonePalettes.done },
  HOLD:        { label: '대기',   ...tonePalettes.neutral },
  FREEZE:      { label: '동결',   ...tonePalettes.warn },
  HOUSE_MONEY: { label: '원금회수', bg: '#EDE5F5', fg: '#5B3A8C' },
  FULL:        { label: '풀',     ...tonePalettes.done },
}

function momentumTone(score: number | null | undefined): { bg: string; fg: string } {
  if (score == null) return tonePalettes.neutral
  if (score >= 60) return tonePalettes.done
  if (score >= 35) return tonePalettes.warn
  return tonePalettes.neg
}

function trancheTone(tranche: number): { bg: string; fg: string } {
  if (tranche >= 8) return tonePalettes.done
  if (tranche >= 5) return tonePalettes.info
  return tonePalettes.neutral
}

function fmtPrice(price: number, currency?: string): string {
  if (currency === 'USD' || currency === 'US') return `$${price.toFixed(2)}`
  return `${price.toLocaleString()}`
}

function fmtTargetPrice(price: number, currency?: string): string {
  if (currency === 'USD' || currency === 'US') return `$${price.toFixed(0)}`
  return `${Math.round(price / 10000).toLocaleString()}만`
}

/* ── Component ── */

export const StockCard = memo(function StockCard({ data, onClick, onRemove, onPin, pinned, draggable, bordered }: {
  data: StockCardData
  onClick?: () => void
  onRemove?: () => void
  onPin?: () => void
  pinned?: boolean
  draggable?: boolean
  bordered?: boolean
}) {
  const [hovered, setHovered] = useState(false)
  const changePct = data.changePercent ?? 0
  const changeColor = changePct > 0 ? t.accent.pos : changePct < 0 ? t.accent.neg : t.neutrals.subtle

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData('application/json', JSON.stringify({
          ticker: data.ticker, name: data.name, sector: data.sector,
          axis: data.axis, group: data.group, researchId: data.researchId,
        }))
        e.dataTransfer.effectAllowed = 'move'
      }}
      style={{
        padding: '8px 10px',
        borderRadius: t.radius.md,
        background: data.pinned ? '#FFFBF0' : t.neutrals.inner,
        // 추매(BUY) 신호 종목은 녹색 테두리로 구분 (bordered 기본 테두리보다 우선)
        border: data.pyramiding?.status === 'BUY' ? `1px solid ${t.accent.pos}`
          : bordered ? `1px solid ${t.neutrals.line}` : undefined,
        cursor: draggable ? 'grab' : onClick ? 'pointer' : 'default',
        transition: 'background .1s',
        position: 'relative',
      }}
    >
      {/* Action buttons on hover */}
      {hovered && (onRemove || onPin) && (
        <div style={{
          position: 'absolute', top: 4, right: 4, display: 'flex', gap: 2, zIndex: 1,
        }}>
          {onPin && (
            <button
              onClick={(e) => { e.stopPropagation(); onPin() }}
              style={{
                width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: t.radius.sm, border: 'none', cursor: 'pointer',
                background: pinned ? '#FEF3C7' : t.neutrals.card,
                color: pinned ? '#D97706' : t.neutrals.subtle,
                fontSize: 11, lineHeight: 1, padding: 0,
              }}
              title={pinned ? '핀 해제' : '핀 지정'}
            >
              📌
            </button>
          )}
          {onRemove && (
            <button
              onClick={(e) => { e.stopPropagation(); onRemove() }}
              style={{
                width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: t.radius.sm, border: 'none', cursor: 'pointer',
                background: t.neutrals.card, color: t.neutrals.subtle, fontSize: 12,
                lineHeight: 1, padding: 0,
              }}
              onMouseEnter={(e) => { (e.currentTarget.style.background = '#FEE2E2'); (e.currentTarget.style.color = t.accent.neg) }}
              onMouseLeave={(e) => { (e.currentTarget.style.background = t.neutrals.card); (e.currentTarget.style.color = t.neutrals.subtle) }}
            >
              ✕
            </button>
          )}
        </div>
      )}
      {/* Row 1: ticker + name + price/mcap */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
          <span style={{ fontSize: 12, fontWeight: t.weight.bold, fontFamily: t.font.mono, color: t.neutrals.text }}>
            {data.ticker.replace('.KS', '')}
          </span>
          <span style={{
            fontSize: 11, color: t.neutrals.muted,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{data.name}</span>
          {(data.structuralThesis || data.valueChainPosition) && (
            <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }} className="info-tip">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={t.neutrals.subtle} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ cursor: 'help', opacity: 0.6 }}>
                <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
              </svg>
              <span className="info-tip-content" style={{
                display: 'none', position: 'absolute', left: '50%', bottom: '100%',
                transform: 'translateX(-50%)', marginBottom: 6,
                background: '#1E293B', color: '#F8FAFC', fontSize: 10.5, lineHeight: 1.5,
                padding: '8px 10px', borderRadius: 6, width: 240, zIndex: 100,
                whiteSpace: 'normal', pointerEvents: 'none',
              }}>
                {data.valueChainPosition && <div style={{ fontWeight: 600, marginBottom: 3 }}>{data.valueChainPosition}</div>}
                {data.structuralThesis}
              </span>
              <style>{`.info-tip:hover .info-tip-content{display:block!important}`}</style>
            </span>
          )}
          {/* QLD 전환 후보: 6개월 모멘텀이 QLD보다 낮아 베타 강등 후보 */}
          {data.qldTransition && (
            <span style={{
              fontSize: 9, fontWeight: t.weight.medium, padding: '1px 5px', borderRadius: t.radius.sm,
              flexShrink: 0, background: tonePalettes.neg.bg, color: tonePalettes.neg.fg,
            }}>QLD 전환 후보</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {data.marketCapLabel && (
            <span style={{ fontSize: 10, color: t.neutrals.subtle, fontFamily: t.font.mono }}>
              {data.marketCapLabel}
            </span>
          )}
          {data.group !== 'research' && data.price != null && (
            <span style={{ fontSize: 11.5, fontWeight: t.weight.medium, fontFamily: t.font.mono }}>
              {fmtPrice(data.price, data.currency)}
            </span>
          )}
        </div>
      </div>

      {/* Row 2: 세부 sector(라벨) + 스몰캡 + change% — 부모 axis는 sub-group 헤더와 중복되어 제거 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 3 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
          {data.sector ? (
            <span style={{
              fontSize: 9.5, fontWeight: t.weight.medium, padding: '1px 5px',
              borderRadius: t.radius.sm, background: t.neutrals.card, color: t.neutrals.muted,
            }}>{data.sector}</span>
          ) : (data.group === 'watchlist' || data.group === 'research') ? (
            <span style={{
              fontSize: 9.5, fontWeight: t.weight.medium, padding: '1px 5px',
              borderRadius: t.radius.sm, background: '#FEF3C7', color: '#B45309',
            }}>미분류</span>
          ) : null}
          {data.sourceType === 'smallcap' && (
            <span style={{
              fontSize: 9, fontWeight: t.weight.medium, padding: '1px 4px',
              borderRadius: t.radius.sm, background: '#E0E7FF', color: '#4338CA',
            }}>스몰캡</span>
          )}
        </div>
        {data.changePercent != null && (
          <span style={{ fontSize: 11, fontWeight: t.weight.medium, fontFamily: t.font.mono, color: changeColor }}>
            <span style={{ fontSize: 9, opacity: 0.6 }}>1M </span>
            {changePct > 0 ? '+' : ''}{changePct.toFixed(1)}%
          </span>
        )}
      </div>

      {/* Row 3: signal + momentum + holdings */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {data.signal && SIGNAL_STYLE[data.signal] && (
            <span style={{
              fontSize: 9.5, fontWeight: t.weight.medium, padding: '1px 5px',
              borderRadius: t.radius.pill, background: SIGNAL_STYLE[data.signal].bg, color: SIGNAL_STYLE[data.signal].fg,
            }}>
              {SIGNAL_STYLE[data.signal].label}
              {data.gapFromHighPct != null && ` ${data.gapFromHighPct > 0 ? '+' : ''}${data.gapFromHighPct.toFixed(1)}%`}
            </span>
          )}
          {data.momentumScore != null && (() => {
            const mt = momentumTone(data.momentumScore)
            return (
              <span style={{
                fontSize: 9.5, fontWeight: t.weight.medium, padding: '1px 5px',
                borderRadius: t.radius.pill, background: mt.bg, color: mt.fg,
              }}>
                M {data.momentumScore}
              </span>
            )
          })()}
          {data.group === 'portfolio' && data.holdingQty != null && (
            <span style={{ fontSize: 10, color: t.neutrals.subtle }}>
              {data.holdingQty}주{data.weightPct != null && ` · ${data.weightPct}%`}
            </span>
          )}
          {/* Research: verdict + composite */}
          {data.group === 'research' && data.verdict && (
            <span style={{
              fontSize: 9.5, fontWeight: t.weight.medium, padding: '1px 5px',
              borderRadius: t.radius.pill,
              background: data.verdict === 'pass_tier1' ? tonePalettes.done.bg : tonePalettes.info.bg,
              color: data.verdict === 'pass_tier1' ? tonePalettes.done.fg : tonePalettes.info.fg,
            }}>
              {data.verdict === 'pass_tier1' ? 'Tier 1' : 'Tier 2'}
            </span>
          )}
          {data.group === 'research' && data.compositeScore != null && (
            <span style={{ fontSize: 10, color: t.neutrals.subtle }}>
              점수 {data.compositeScore}
            </span>
          )}
        </div>
      </div>

      {/* Row 4: Monitoring (pinned watchlist) */}
      {data.monitor && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
          {(() => {
            const mt = data.monitor.stage >= 7 ? { bg: '#EDE5F5', fg: '#5B3A8C' }
              : data.monitor.stage >= 4 ? tonePalettes.info : tonePalettes.neutral
            return (
              <span style={{
                fontSize: 9, fontWeight: t.weight.bold, padding: '1px 4px',
                borderRadius: t.radius.sm, background: mt.bg, color: mt.fg,
              }}>M{data.monitor.stage}</span>
            )
          })()}
          <span style={{
            fontSize: 10, fontWeight: t.weight.medium, fontFamily: t.font.mono,
            color: data.monitor.changePct > 0 ? t.accent.pos : data.monitor.changePct < 0 ? t.accent.neg : t.neutrals.subtle,
          }}>
            {data.monitor.changePct > 0 ? '+' : ''}{data.monitor.changePct.toFixed(1)}%
          </span>
          {data.monitor.nextThresholdPct != null && (
            <span style={{ fontSize: 10, color: t.neutrals.subtle }}>
              {' '}→ +{data.monitor.nextThresholdPct.toFixed(0)}%
              {data.monitor.nextThresholdPrice != null && (
                <span style={{ color: t.neutrals.subtle, marginLeft: 2, opacity: 0.6 }}>
                  {fmtTargetPrice(data.monitor.nextThresholdPrice, data.currency)}
                </span>
              )}
            </span>
          )}
          <span style={{ fontSize: 10, color: t.neutrals.subtle, opacity: 0.5 }}>{data.monitor.days}일</span>
        </div>
      )}

      {/* Row 5: Pyramiding (portfolio) */}
      {data.pyramiding && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {(() => {
              const tt = trancheTone(data.pyramiding.tranche)
              return (
                <span style={{
                  fontSize: 9, fontWeight: t.weight.bold, padding: '1px 4px',
                  borderRadius: t.radius.sm, background: tt.bg, color: tt.fg,
                }}>T{data.pyramiding.tranche}</span>
              )
            })()}
            <span style={{
              fontSize: 10, fontWeight: t.weight.medium, fontFamily: t.font.mono,
              color: data.pyramiding.avgReturnPct > 0 ? t.accent.pos
                : data.pyramiding.avgReturnPct < 0 ? t.accent.neg : t.neutrals.subtle,
            }}>
              {data.pyramiding.avgReturnPct > 0 ? '+' : ''}{data.pyramiding.avgReturnPct.toFixed(1)}%
            </span>
            {data.pyramiding.nextTriggerPct != null && (
              <span style={{ fontSize: 10, color: t.neutrals.subtle }}>
                → +{data.pyramiding.nextTriggerPct.toFixed(0)}%
                {data.pyramiding.nextTriggerPrice != null && (
                  <span style={{ marginLeft: 2, opacity: 0.6 }}>
                    {fmtTargetPrice(data.pyramiding.nextTriggerPrice, data.currency)}
                  </span>
                )}
              </span>
            )}
          </div>
          {(() => {
            const ps = PYRAMID_STATUS[data.pyramiding.status]
            return ps ? (
              <span style={{
                fontSize: 9, fontWeight: t.weight.bold, padding: '1px 6px',
                borderRadius: t.radius.pill, background: ps.bg, color: ps.fg,
              }}>{ps.label}</span>
            ) : null
          })()}
        </div>
      )}
    </div>
  )
})
