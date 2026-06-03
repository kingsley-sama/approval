import type { Metadata } from 'next'
import { Inter, Manrope } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/toaster'
import { ConfirmDialogProvider } from '@/components/confirm-dialog'
import { TooltipProvider } from '@/components/ui/tooltip'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
})

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Revision - Annotation & Approval Tool for feedback on renders',
  description: 'Give feedback on renders with ease using Revision, the annotation and approval tool designed for artists, clients, and teams.',
  generator: 'Next.js',
  manifest: '/favicon_io/site.webmanifest',
  icons: {
    icon: '/favicon_io/android-chrome-192x192.png',
    shortcut: '/favicon_io/android-chrome-192x192.png',
    apple: '/favicon_io/android-chrome-192x192.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${manrope.variable} font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          <TooltipProvider delayDuration={200} skipDelayDuration={300}>
            <ConfirmDialogProvider>
              {children}
            </ConfirmDialogProvider>
          </TooltipProvider>
        </ThemeProvider>
        <Toaster />
        <Analytics />
      </body>
    </html>
  )
}
