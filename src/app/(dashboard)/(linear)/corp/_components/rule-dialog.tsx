'use client'

import { useEffect, useState } from 'react'
import { t, tonePalettes } from '@/app/(dashboard)/_components/linear-tokens'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { LTableBadge } from '@/app/(dashboard)/_components/linear-table'
import { CORP_RULE_TYPE_LABEL, type CorpRule } from '@/types/willow-corp'

interface Props {
  rule: CorpRule | null
  onClose: () => void
}

export function RuleDialog({ rule, onClose }: Props) {
  // 규정이 바뀌면 펼침 상태가 자연히 무효가 되도록 규정 id를 함께 든다.
  const [open, setOpen] = useState<{ ruleId: string; key: string } | null>(null)

  useEffect(() => {
    if (!rule) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rule, onClose])

  if (!rule) return null
  const period = `${rule.effective_from} ~ ${rule.effective_to ?? '현행'}`

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(14,15,18,0.18)', backdropFilter: 'blur(3px)' }} />
      <div style={{
        position: 'relative', width: 'min(640px, calc(100vw - 24px))', maxHeight: '85vh',
        background: t.neutrals.card, borderRadius: t.radius.lg + 2,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 20px 12px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, fontWeight: 600, color: t.neutrals.subtle, letterSpacing: 0.6, marginBottom: 4 }}>
              {(CORP_RULE_TYPE_LABEL[rule.rule_type] ?? rule.rule_type).toUpperCase()} · v{rule.version_no}
            </div>
            <div style={{ fontSize: 'calc(16px * var(--fz, 1))', fontWeight: t.weight.semibold, fontFamily: t.font.sans, color: t.neutrals.text, lineHeight: 1.35 }}>
              {rule.title}
            </div>
          </div>
          <button onClick={onClose} aria-label="닫기" style={{
            width: 28, height: 28, borderRadius: t.radius.sm, flexShrink: 0,
            background: t.neutrals.inner, border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.neutrals.muted,
          }}>
            <LIcon name="x" size={14} stroke={2} />
          </button>
        </div>

        <div style={{ padding: '0 20px 12px', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <LTableBadge tone={rule.effective_to === null ? tonePalettes.done : tonePalettes.neutral}>{rule.effective_to === null ? '현행' : '종료'}</LTableBadge>
          <span style={{ fontFamily: t.font.mono, fontSize: 'calc(11px * var(--fz, 1))', color: t.neutrals.muted }}>{period}</span>
          <span style={{ fontSize: 'calc(11px * var(--fz, 1))', color: t.neutrals.subtle }}>{rule.articles.length}개 조문</span>
        </div>

        {rule.note && (
          <div style={{ margin: '0 20px 10px', padding: '8px 12px', borderRadius: t.radius.md, background: t.neutrals.inner, fontSize: 'calc(11.5px * var(--fz, 1))', color: t.neutrals.muted, lineHeight: 1.5 }}>
            {rule.note}
          </div>
        )}

        <div style={{ padding: '0 20px 16px', overflowY: 'auto', minHeight: 0 }}>
          {rule.articles.map(a => {
            const key = `${a.no}|${a.title}`
            const expanded = open?.ruleId === rule.id && open.key === key
            return (
              <div key={key} style={{ borderTop: `1px solid ${t.neutrals.line}` }}>
                <button
                  onClick={() => setOpen(expanded ? null : { ruleId: rule.id, key })}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0',
                    background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                    fontFamily: t.font.sans, color: t.neutrals.text,
                  }}
                >
                  <span style={{ fontFamily: t.font.mono, fontSize: 'calc(11px * var(--fz, 1))', color: t.neutrals.muted, width: 78, flexShrink: 0 }}>{a.no}</span>
                  <span style={{ flex: 1, fontSize: 'calc(12.5px * var(--fz, 1))', fontWeight: 500 }}>{a.title}</span>
                  <span style={{ color: t.neutrals.subtle, display: 'flex' }}>
                    <LIcon name={expanded ? 'chevronDown' : 'chevronRight'} size={12} stroke={2} />
                  </span>
                </button>
                {expanded && (
                  <div style={{ padding: '0 0 10px 88px', fontSize: 'calc(12px * var(--fz, 1))', color: t.neutrals.text, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {a.text}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
