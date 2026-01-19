'use client'

import { ProtectedPage } from '@/components/auth/protected-page'

export default function ReviewnotesPage() {
  return (
    <ProtectedPage pagePath="/monor/reviewnotes">
      <div className="flex items-center justify-center min-h-[60vh]">
        <h1 className="text-2xl text-muted-foreground">리뷰노트</h1>
      </div>
    </ProtectedPage>
  );
}
