'use client'

import { ProtectedPage } from '@/components/auth/protected-page'

export default function VoicecardsPage() {
  return (
    <ProtectedPage pagePath="/monor/voicecards">
      <div className="flex items-center justify-center min-h-[60vh]">
        <h1 className="text-2xl text-muted-foreground">보이스카드</h1>
      </div>
    </ProtectedPage>
  );
}
