import type { Metadata } from 'next'
import { ReactNode } from 'react'

export const metadata: Metadata = { title: '로그인' }

export default function Layout({ children }: { children: ReactNode }) {
  return children
}
