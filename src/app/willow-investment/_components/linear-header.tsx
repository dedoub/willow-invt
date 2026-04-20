'use client'

import { t } from './linear-tokens'
import { LIcon } from './linear-icons'
import { ReactNode } from 'react'

interface LinearHeaderProps {
  title: string
  onAgentToggle?: () => void
  agentOpen?: boolean
  actions?: ReactNode
}

export function LinearHeader({ title, onAgentToggle, agentOpen, actions }: LinearHeaderProps) {
  return (
    <header style={{
      height: 52, padding: '0 20px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      background: t.neutrals.page,
      borderBottom: `1px solid ${t.neutrals.line}`,
      flexShrink: 0, fontFamily: t.font.sans,
    }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, minWidth: 0 }}>
        <span style={{ color: t.neutrals.muted }}>Willow</span>
        <LIcon name="chevronRight" size={11} color={t.neutrals.subtle} stroke={2} />
        <span style={{ color: t.neutrals.text, fontWeight: 500 }}>{title}</span>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {actions}
        {onAgentToggle && (
          <button onClick={onAgentToggle} style={{
            height: 28, padding: '0 10px', borderRadius: 6,
            background: agentOpen ? t.brand[600] : t.neutrals.inner,
            color: agentOpen ? '#fff' : t.neutrals.text,
            border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 500,
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontFamily: t.font.sans,
          }}>
            <span style={{ fontSize: 12 }}>✦</span>
            <span>Agent</span>
          </button>
        )}
      </div>
    </header>
  )
}
