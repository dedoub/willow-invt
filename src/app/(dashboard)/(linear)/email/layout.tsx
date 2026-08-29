import { ReactNode } from 'react'
import { navMetadata } from '../_metadata'

export const metadata = navMetadata('/email')

export default function Layout({ children }: { children: ReactNode }) {
  return children
}
