import { Inter, JetBrains_Mono } from 'next/font/google'
import './v2-tokens.css'

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-v2-sans',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-v2-mono',
  display: 'swap',
})

export default function ManagementV2Layout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className={`${inter.variable} ${jetbrainsMono.variable} mgmt-v2`}>
      {children}
    </div>
  )
}
