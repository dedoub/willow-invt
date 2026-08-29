import type { Metadata } from 'next'
import { ReactNode } from 'react'

export const metadata: Metadata = { title: '보유 종목' }

export default function Layout({ children }: { children: ReactNode }) {
  return children
}
