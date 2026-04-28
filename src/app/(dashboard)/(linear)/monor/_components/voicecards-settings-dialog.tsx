'use client'

import { useState, useEffect } from 'react'
import { t } from '@/app/(dashboard)/_components/linear-tokens'
import { LBtn } from '@/app/(dashboard)/_components/linear-btn'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'

interface VoicecardsSettingsDialogProps {
  open: boolean
  onClose: () => void
  onSave: () => void
}

interface MaskedCredentials {
  ios_issuer_id: string | null
  ios_key_id: string | null
  ios_private_key: string | null
  ios_app_id: string | null
  ios_vendor_number: string | null
  android_service_account: string | null
  android_package_name: string | null
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
  const [loadingCreds, setLoadingCreds] = useState(false)
  const [existing, setExisting] = useState<MaskedCredentials | null>(null)

  // iOS
  const [iosIssuerId, setIosIssuerId] = useState('')
  const [iosKeyId, setIosKeyId] = useState('')
  const [iosPrivateKey, setIosPrivateKey] = useState('')
  const [iosAppId, setIosAppId] = useState('')
  const [iosVendorNumber, setIosVendorNumber] = useState('')

  // Android
  const [androidServiceAccount, setAndroidServiceAccount] = useState('')
  const [androidPackageName, setAndroidPackageName] = useState('')

  // 모달 열릴 때 기존 설정값 로드
  useEffect(() => {
    if (!open) return
    setLoadingCreds(true)
    fetch('/api/voicecards/credentials')
      .then(r => r.json())
      .then(data => {
        if (data.credentials) {
          setExisting(data.credentials)
          // 마스킹되지 않은 값은 실제 값으로 채우기
          if (data.credentials.ios_app_id) setIosAppId(data.credentials.ios_app_id)
          if (data.credentials.ios_vendor_number) setIosVendorNumber(data.credentials.ios_vendor_number)
          if (data.credentials.android_package_name) setAndroidPackageName(data.credentials.android_package_name)
        }
      })
      .catch(err => console.error('Error loading credentials:', err))
      .finally(() => setLoadingCreds(false))

    // 폼 초기화
    setIosIssuerId('')
    setIosKeyId('')
    setIosPrivateKey('')
    setIosAppId('')
    setIosVendorNumber('')
    setAndroidServiceAccount('')
    setAndroidPackageName('')
  }, [open])

  if (!open) return null

  const handleSave = async () => {
    setSaving(true)
    try {
      const body: Record<string, string | null> = {}

      // 빈 문자열은 기존값 유지 (보내지 않음), 입력된 값만 업데이트
      if (iosIssuerId) body.ios_issuer_id = iosIssuerId
      if (iosKeyId) body.ios_key_id = iosKeyId
      if (iosPrivateKey) body.ios_private_key = iosPrivateKey
      if (iosAppId) body.ios_app_id = iosAppId
      if (iosVendorNumber) body.ios_vendor_number = iosVendorNumber
      if (androidServiceAccount) body.android_service_account = androidServiceAccount
      if (androidPackageName) body.android_package_name = androidPackageName

      const res = await fetch('/api/voicecards/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
              보이스카드 API 설정
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
          {loadingCreds ? (
            <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12, color: t.neutrals.muted }}>
              설정 불러오는 중...
            </div>
          ) : (
            <>
              {/* iOS Section */}
              <div>
                <div style={{ fontSize: 12, fontWeight: t.weight.medium, color: t.neutrals.text, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  App Store Connect API
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 12 }}>
                  <div>
                    <Label>Issuer ID</Label>
                    <input
                      value={iosIssuerId}
                      onChange={e => setIosIssuerId(e.target.value)}
                      placeholder={existing?.ios_issuer_id || 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'}
                      style={inputBase}
                    />
                  </div>
                  <div>
                    <Label>Key ID</Label>
                    <input
                      value={iosKeyId}
                      onChange={e => setIosKeyId(e.target.value)}
                      placeholder={existing?.ios_key_id || 'XXXXXXXXXX'}
                      style={inputBase}
                    />
                  </div>
                  <div>
                    <Label>Private Key (.p8)</Label>
                    <textarea
                      value={iosPrivateKey}
                      onChange={e => setIosPrivateKey(e.target.value)}
                      placeholder={existing?.ios_private_key || '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----'}
                      rows={3}
                      style={textareaBase}
                    />
                  </div>
                  <div>
                    <Label>App ID</Label>
                    <input
                      value={iosAppId}
                      onChange={e => setIosAppId(e.target.value)}
                      placeholder="123456789"
                      style={inputBase}
                    />
                  </div>
                  <div>
                    <Label>Vendor Number</Label>
                    <input
                      value={iosVendorNumber}
                      onChange={e => setIosVendorNumber(e.target.value)}
                      placeholder="88051795"
                      style={inputBase}
                    />
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
                    <textarea
                      value={androidServiceAccount}
                      onChange={e => setAndroidServiceAccount(e.target.value)}
                      placeholder={existing?.android_service_account || '{"type": "service_account", ...}'}
                      rows={3}
                      style={textareaBase}
                    />
                  </div>
                  <div>
                    <Label>Package Name</Label>
                    <input
                      value={androidPackageName}
                      onChange={e => setAndroidPackageName(e.target.value)}
                      placeholder="com.example.app"
                      style={inputBase}
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px', background: t.neutrals.inner,
          display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8,
        }}>
          <LBtn variant="ghost" size="sm" onClick={onClose}>취소</LBtn>
          <LBtn variant="brand" size="sm" onClick={handleSave} disabled={saving || loadingCreds}>
            {saving ? '저장 중...' : '저장'}
          </LBtn>
        </div>
      </div>
    </div>
  )
}
