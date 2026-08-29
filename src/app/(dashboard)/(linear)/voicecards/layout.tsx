import { ReactNode } from 'react'
import { navMetadata } from '../_metadata'

export const metadata = navMetadata('/voicecards')

export default function Layout({ children }: { children: ReactNode }) {
  return children
}
