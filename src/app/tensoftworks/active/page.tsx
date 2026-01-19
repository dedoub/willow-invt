'use client'

import { ProjectList } from '@/components/tensoftworks/project-list'
import { ProtectedPage } from '@/components/auth/protected-page'

export default function ActiveProjectsPage() {
  return (
    <ProtectedPage pagePath="/tensoftworks/active">
      <ProjectList status="active" />
    </ProtectedPage>
  )
}
