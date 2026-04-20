import { Inter as InterTight } from 'next/font/google'
import { JetBrains_Mono } from 'next/font/google'

const interTight = InterTight({
  subsets: ['latin'],
  variable: '--font-inter-tight',
  weight: ['400', '500', '600', '700'],
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  weight: ['400', '500', '600'],
})

export default function LinearRouteLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className={`${interTight.variable} ${jetbrainsMono.variable}`}>
      {children}
    </div>
  )
}
