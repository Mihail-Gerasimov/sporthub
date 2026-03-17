import type { Metadata } from 'next';
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
      <body>{children}</body>
    </html>
  );
}
