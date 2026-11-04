import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'UZBL Repairs',
  description: 'Drop any repair list. Track every repair. Demo with sample data.',
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: 'UZBL Repairs', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
