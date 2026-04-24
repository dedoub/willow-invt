'use client'

import { useState } from 'react'
import { t } from '@/app/willow-investment/_components/linear-tokens'
import { LBtn } from '@/app/willow-investment/_components/linear-btn'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'

interface VoicecardsSettingsDialogProps {
  open: boolean
  onClose: () => void
  onSave: () => void
}

const inputBase: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: 13,
  fontFamily: t.font.sans, fontWeight: t.weight.regular,
  background: t.neutrals.inner, color: t.neutrals.text,
  border: 'none', borderRadius: t.radius.sm, outline: 'none',
  boxSizing: 'border-box',
}

const textareaBase: React.CSSProperties = {
  ...inputBase, resize: 'vertical' as const, lineHeight: 1.5,
  fontFamily: t.font.mono, fontSize: 11,
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: t.weight.medium, color: t.neutrals.subtle,
      fontFamily: t.font.sans, marginBottom: 5,
    }}>
      {children}
    </div>
  )
}

export function VoicecardsSettingsDialog({ open, onClose, onSave }: VoicecardsSettingsDialogProps) {
  const [saving, setSaving] = useState(false)

  // iOS
  const [iosIssuerId, setIosIssuerId] = useState('')
  const [iosKeyId, setIosKeyId] = useState('')
  const [iosPrivateKey, setIosPrivateKey] = useState('')
  const [iosAppId, setIosAppId] = useState('')

  // Android
  const [androidServiceAccount, setAndroidServiceAccount] = useState('')
  const [androidPackageName, setAndroidPackageName] = useState('')

  if (!open) return null

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/voicecards/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ios_issuer_id: iosIssuerId || null,
          ios_key_id: iosKeyId || null,
          ios_private_key: iosPrivateKey || null,
          ios_app_id: iosAppId || null,
          android_service_account: androidServiceAccount || null,
          android_package_name: androidPackageName || null,
        }),
      })
      if (res.ok) {
        onSave()
        onClose()
      }
    } catch (err) {
      console.error('Error saving credentials:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(14,15,18,0.18)', backdropFilter: 'blur(3px)' }} />

      <div style={{
        position: 'relative', width: 520, maxHeight: '85vh',
        background: t.neutrals.card, borderRadius: t.radius.lg + 2,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{
              fontSize: 10, fontFamily: t.font.mono, fontWeight: 600,
              color: t.neutrals.subtle, letterSpacing: 0.6,
              textTransform: 'uppercase' as const, marginBottom: 2,
            }}>API SETTINGS</div>
            <div style={{ fontSize: 15, fontWeight: t.weight.semibold, fontFamily: t.font.sans, color: t.neutrals.text }}>
              VoiceCards API 설정
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: t.radius.sm,
            background: t.neutrals.inner, border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.neutrals.muted,
          }}>
            <LIcon name="x" size={14} stroke={2} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '0 20px 16px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* iOS Section */}
          <div>
            <div style={{ fontSize: 12, fontWeight: t.weight.medium, color: t.neutrals.text, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              App Store Connect API
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 12 }}>
              <div>
                <Label>Issuer ID</Label>
                <input value={iosIssuerId} onChange={e => setIosIssuerId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" style={inputBase} />
              </div>
              <div>
                <Label>Key ID</Label>
                <input value={iosKeyId} onChange={e => setIosKeyId(e.target.value)} placeholder="XXXXXXXXXX" style={inputBase} />
              </div>
              <div>
                <Label>Private Key (.p8)</Label>
                <textarea value={iosPrivateKey} onChange={e => setIosPrivateKey(e.target.value)} placeholder={"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"} rows={3} style={textareaBase} />
              </div>
              <div>
                <Label>App ID (Vendor Number)</Label>
                <input value={iosAppId} onChange={e => setIosAppId(e.target.value)} placeholder="123456789" style={inputBase} />
              </div>
            </div>
          </div>

          {/* Android Section */}
          <div>
            <div style={{ fontSize: 12, fontWeight: t.weight.medium, color: t.neutrals.text, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              Google Play Developer API
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 12 }}>
              <div>
                <Label>Service Account JSON</Label>
                <textarea value={androidServiceAccount} onChange={e => setAndroidServiceAccount(e.target.value)} placeholder='{"type": "service_account", ...}' rows={3} style={textareaBase} />
              </div>
              <div>
                <Label>Package Name</Label>
                <input value={androidPackageName} onChange={e => setAndroidPackageName(e.target.value)} placeholder="com.example.app" style={inputBase} />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px', background: t.neutrals.inner,
          display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8,
        }}>
          <LBtn variant="ghost" size="sm" onClick={onClose}>취소</LBtn>
          <LBtn variant="brand" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? '저장 중...' : '저장'}
          </LBtn>
        </div>
      </div>
    </div>
  )
}
