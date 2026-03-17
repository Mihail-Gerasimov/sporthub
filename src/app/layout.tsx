import type { Metadata } from 'next';
import { AppShell } from '@/components/layout';
import './globals.css';

export const metadata: Metadata = {
  title: 'SportHub',
  description: 'Маркетплейс спортивных услуг',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
