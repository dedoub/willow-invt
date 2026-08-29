import type { Metadata } from 'next'
import { ReactNode } from 'react'

export const metadata: Metadata = { title: 'MCP 연결 승인' }

export default function Layout({ children }: { children: ReactNode }) {
  return children
}
