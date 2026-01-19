'use client'

import { ProjectList } from '@/components/tensoftworks/project-list'
import { ProtectedPage } from '@/components/auth/protected-page'

export default function ManagedProjectsPage() {
  return (
    <ProtectedPage pagePath="/tensoftworks/managed">
      <ProjectList status="managed" />
    </ProtectedPage>
  )
}
