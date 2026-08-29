import type { Metadata } from 'next'
import { ReactNode } from 'react'

export const metadata: Metadata = { title: '투자 칸반' }

export default function Layout({ children }: { children: ReactNode }) {
  return children
}
