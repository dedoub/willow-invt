'use client'

import { useState, useEffect, useRef } from 'react'
import { t } from '@/app/(dashboard)/_components/linear-tokens'
import { LBtn } from '@/app/(dashboard)/_components/linear-btn'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import {
  ETFDisplayData,
  ETFDocument,
  fetchETFDocuments,
  uploadETFDocument,
  getDocumentDownloadUrl,
  deleteETFDocument,
} from '@/lib/supabase-etf'

interface DocumentPanelProps {
  etf: ETFDisplayData | null
  onClose: () => void
}

function fmtSize(bytes: number): string {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

export function DocumentPanel({ etf, onClose }: DocumentPanelProps) {
  const [docs, setDocs] = useState<ETFDocument[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!etf) return
    setLoading(true)
    fetchETFDocuments(etf.symbol).then(docs => {
      setDocs(docs)
      setLoading(false)
    })
  }, [etf])

  if (!etf) return null

  const reload = () => {
    setLoading(true)
    fetchETFDocuments(etf.symbol).then(docs => {
      setDocs(docs)
      setLoading(false)
    })
  }

  const handleDownload = async (name: string) => {
    const url = await getDocumentDownloadUrl(etf.symbol, name)
    if (url) window.open(url, '_blank')
  }

  const handleDelete = async (name: string) => {
    if (!confirm(`"${name}" 을 삭제할까요?`)) return
    const ok = await deleteETFDocument(etf.symbol, name)
    if (ok) reload()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    await uploadETFDocument(etf.symbol, file)
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    reload()
  }

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '7px 10px',
    borderBottom: `1px solid ${t.neutrals.line}`,
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: t.neutrals.card,
          borderRadius: t.radius.lg,
          width: '100%',
          maxWidth: 440,
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          maxHeight: '80vh',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{
            fontSize: 13,
            fontWeight: t.weight.semibold,
            fontFamily: t.font.sans,
            color: t.neutrals.text,
          }}>
            문서 관리 — {etf.symbol}
          </span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: t.neutrals.subtle }}
          >
            <LIcon name="x" size={16} />
          </button>
        </div>

        {/* Document list */}
        <div style={{
          background: t.neutrals.inner,
          borderRadius: t.radius.md,
          overflow: 'hidden',
          flex: 1,
          overflowY: 'auto',
          minHeight: 80,
        }}>
          {loading ? (
            <div style={{
              padding: 24, textAlign: 'center',
              fontSize: 12, color: t.neutrals.subtle, fontFamily: t.font.sans,
            }}>
              문서 로딩중...
            </div>
          ) : docs.length === 0 ? (
            <div style={{
              padding: 24, textAlign: 'center',
              fontSize: 12, color: t.neutrals.subtle, fontFamily: t.font.sans,
            }}>
              등록된 문서가 없습니다
            </div>
          ) : (
            docs.map(doc => (
              <div key={doc.name} style={rowStyle}>
                <LIcon name="file" size={14} color={t.neutrals.muted} />
                <span style={{
                  flex: 1,
                  fontSize: 12,
                  fontFamily: t.font.sans,
                  color: t.neutrals.text,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {doc.name}
                </span>
                <span style={{
                  fontSize: 10,
                  fontFamily: t.font.mono,
                  color: t.neutrals.subtle,
                  whiteSpace: 'nowrap',
                }}>
                  {fmtSize(doc.size)}
                </span>
                <button
                  onClick={() => handleDownload(doc.name)}
                  title="다운로드"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: t.neutrals.subtle }}
                >
                  <LIcon name="arrow" size={13} />
                </button>
                <button
                  onClick={() => handleDelete(doc.name)}
                  title="삭제"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: t.neutrals.subtle }}
                >
                  <LIcon name="trash" size={13} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Upload section */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
          <input
            ref={fileInputRef}
            type="file"
            id="doc-panel-file-input"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          <LBtn
            size="sm"
            variant="secondary"
            icon={<LIcon name="paperclip" size={13} color={t.neutrals.text} />}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? '업로드 중...' : '파일 업로드'}
          </LBtn>
        </div>
      </div>
    </div>
  )
}
