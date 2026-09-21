import type { Metadata } from 'next'
import { Roboto_Mono, Roboto_Condensed } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const robotoCondensed = Roboto_Condensed({ subsets: ["latin"], weight: ['400', '700', '900'] });
const robotoMono = Roboto_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: 'Remote Firing Analyzer | BD-08 Rifle Zeroing',
  description: 'Professional ballistic data analysis tool for military rifle sight zeroing',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`font-sans antialiased ${robotoCondensed.className}`}>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
