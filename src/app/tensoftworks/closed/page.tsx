'use client'

import { ProjectList } from '@/components/tensoftworks/project-list'
import { ProtectedPage } from '@/components/auth/protected-page'

export default function ClosedProjectsPage() {
  return (
    <ProtectedPage pagePath="/tensoftworks/closed">
      <ProjectList status="closed" />
    </ProtectedPage>
  )
}
