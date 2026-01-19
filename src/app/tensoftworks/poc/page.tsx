'use client'

import { ProjectList } from '@/components/tensoftworks/project-list'
import { ProtectedPage } from '@/components/auth/protected-page'

export default function PocProjectsPage() {
  return (
    <ProtectedPage pagePath="/tensoftworks/poc">
      <ProjectList status="poc" />
    </ProtectedPage>
  )
}
