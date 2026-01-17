'use client'

import { useI18n } from '@/lib/i18n/context'

export default function RyuhaStudyPage() {
  const { t } = useI18n()

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <p className="text-muted-foreground">{t.sidebar.ryuhaStudy}</p>
    </div>
  )
}
