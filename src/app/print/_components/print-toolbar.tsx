'use client'

interface PrintToolbarProps {
  title: string
  subtitle?: string
}

export function PrintToolbar({ title, subtitle }: PrintToolbarProps) {
  return (
    <div className="print-toolbar" style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 20px', borderBottom: '1px solid #E5E7EB',
      background: '#F9FAFB', position: 'sticky', top: 0, zIndex: 10,
    }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: '#6B7280' }}>{subtitle}</div>}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => window.print()}
          style={{
            padding: '6px 14px', fontSize: 12, fontWeight: 500,
            background: '#1F2937', color: '#fff', border: 'none', borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          인쇄 / PDF 저장
        </button>
        <button
          onClick={() => window.close()}
          style={{
            padding: '6px 14px', fontSize: 12, fontWeight: 500,
            background: '#fff', color: '#374151', border: '1px solid #D1D5DB',
            borderRadius: 6, cursor: 'pointer',
          }}
        >
          닫기
        </button>
      </div>
      <style>{`
        @media print {
          .print-toolbar { display: none !important; }
          @page { margin: 12mm; }
          body { background: white !important; }
        }
      `}</style>
    </div>
  )
}
