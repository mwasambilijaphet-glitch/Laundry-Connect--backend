import type { Metadata } from 'next';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '@/providers/AuthProvider';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Fashion.co.tz', template: '%s · Fashion.co.tz' },
  description: 'AI-powered fashion design, outfit recommendations, and your personal bilingual fashion assistant for Tanzania.',
  keywords: ['fashion', 'Tanzania', 'AI fashion', 'outfit recommendations', 'kitenge', 'ankara'],
  openGraph: {
    title: 'Fashion.co.tz',
    description: 'Your AI-Powered Tanzanian Fashion Platform',
    type: 'website',
    locale: 'en_TZ',
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <AuthProvider>
            {children}
            <Toaster
              position="top-right"
              toastOptions={{
                duration: 4000,
                style: {
                  background: 'var(--toast-bg, #111)',
                  color: 'var(--toast-color, #fff)',
                  border: '1px solid #333',
                  borderRadius: '12px',
                  fontSize: '14px',
                },
                success: { iconTheme: { primary: '#c9a96e', secondary: '#111' } },
              }}
            />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
