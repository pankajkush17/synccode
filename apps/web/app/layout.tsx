import type { Metadata, Viewport } from 'next'
import { Geist, JetBrains_Mono } from 'next/font/google'
import type { ReactNode } from 'react'
import { TooltipProvider } from '@/components/ui/Tooltip'
import { themeBootScript } from '@/stores/themeStore'
import './globals.css'

const sans = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' })
const code = JetBrains_Mono({ subsets: ['latin'], variable: '--font-code', display: 'swap' })

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title: { default: 'SyncCode: write code together', template: '%s | SyncCode' },
  description:
    'A real-time collaborative code editor. Open a room, share the link, and edit the same file together with live cursors.',
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0c0f' },
  ],
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The boot script sets data-theme before hydration, so the attribute legitimately differs.
    <html lang="en" className={`${sans.variable} ${code.variable}`} suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static, constant script that prevents a theme flash */}
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
      </body>
    </html>
  )
}
