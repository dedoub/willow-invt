'use client'

import { useMemo, useState } from 'react'
import { t, tonePalettes, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import {
  LTableBadge, LTableBody, LTableDate, LTableEmpty, LTableHead, LTableRow, LTableScroll, type LColumn,
} from '@/app/(dashboard)/_components/linear-table'
import { CORP_RULE_TYPE_LABEL, type CorpRule } from '@/types/willow-corp'
import { todayYmd } from './corp-format'

const COLUMNS: LColumn<CorpRule>[] = [
  { key: 'type', label: '규정', width: '120px' },
  { key: 'title', label: '제목', width: 'minmax(180px,1fr)' },
  { key: 'version', label: '버전', width: '48px', align: 'right' },
  { key: 'from', label: '시행', width: '82px' },
  { key: 'to', label: '종료', width: '82px', hideMobile: true },
  { key: 'articles', label: '조문', width: '48px', align: 'right', hideMobile: true },
  { key: 'chevron', label: '', width: '14px' },
]

interface Props {
  rules: CorpRule[]
  onSelect: (rule: CorpRule) => void
}

function effectiveAt(rule: CorpRule, at: string): boolean {
  return rule.effective_from <= at && (rule.effective_to === null || rule.effective_to >= at)
}

export function RulesBlock({ rules, onSelect }: Props) {
  const mobile = useIsMobile()
  const [at, setAt] = useState(todayYmd)
  const [onlyEffective, setOnlyEffective] = useState(true)

  const shown = useMemo(() => {
    const list = onlyEffective ? rules.filter(r => effectiveAt(r, at)) : rules
    return [...list].sort((a, b) => a.rule_type.localeCompare(b.rule_type) || b.version_no - a.version_no)
  }, [rules, at, onlyEffective])

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapMd, marginBottom: 10, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: `calc(${t.type.control}px * var(--fz, 1))`, color: t.neutrals.muted }}>
          기준일
          <input
            type="date" value={at} onChange={e => setAt(e.target.value || todayYmd())}
            style={{
              height: t.density.controlH, padding: `0 ${t.density.controlPadXSm}px`, borderRadius: t.radius.sm,
              border: 'none', background: t.neutrals.inner, color: t.neutrals.text,
              fontFamily: t.font.mono, fontSize: `calc(${t.type.control}px * var(--fz, 1))`,
            }}
          />
        </label>
        <button
          onClick={() => setOnlyEffective(v => !v)}
          style={{
            height: t.density.controlH, padding: `0 ${t.density.controlPadXSm}px`, borderRadius: t.radius.pill, border: 'none',
            cursor: 'pointer', fontSize: `calc(${t.type.control}px * var(--fz, 1))`, fontFamily: t.font.sans,
            background: onlyEffective ? t.neutrals.text : t.neutrals.inner,
            color: onlyEffective ? t.neutrals.card : t.neutrals.muted,
          }}
        >
          {onlyEffective ? '기준일 시행 중' : '전체 버전'}
        </button>
        <span style={{ fontSize: `calc(${t.type.helper}px * var(--fz, 1))`, color: t.neutrals.subtle }}>
          {shown.length}건
        </span>
      </div>

      <LTableScroll columns={COLUMNS} mobile={mobile}>
        <LTableHead columns={COLUMNS} mobile={mobile} />
        {shown.length === 0 && <LTableEmpty>{onlyEffective ? '기준일에 시행 중인 규정이 없습니다' : '등록된 규정이 없습니다'}</LTableEmpty>}
        <LTableBody columns={COLUMNS} mobile={mobile}>
          {shown.map(rule => {
            const current = rule.effective_to === null
            return (
              <LTableRow key={rule.id} columns={COLUMNS} mobile={mobile} onClick={() => onSelect(rule)}>
                <LTableBadge tone={rule.rule_type === 'articles' ? tonePalettes.brand : tonePalettes.neutral}>
                  {CORP_RULE_TYPE_LABEL[rule.rule_type] ?? rule.rule_type}
                </LTableBadge>
                <span style={{ minWidth: 0, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {rule.title}
                </span>
                <span style={{ textAlign: 'right', fontFamily: t.font.mono, fontSize: 'calc(11px * var(--fz, 1))' }}>v{rule.version_no}</span>
                <LTableDate value={rule.effective_from} format="ymd" />
                {!mobile && (current
                  ? <LTableBadge tone={tonePalettes.done}>현행</LTableBadge>
                  : <LTableDate value={rule.effective_to as string} format="ymd" tone="muted" />)}
                {!mobile && (
                  <span style={{ textAlign: 'right', fontFamily: t.font.mono, fontSize: 'calc(11px * var(--fz, 1))', color: t.neutrals.muted }}>
                    {rule.articles.length}
                  </span>
                )}
                <span style={{ color: t.neutrals.subtle, display: 'flex' }}>
                  <LIcon name="chevronRight" size={12} stroke={2} />
                </span>
              </LTableRow>
            )
          })}
        </LTableBody>
      </LTableScroll>
    </>
  )
}
