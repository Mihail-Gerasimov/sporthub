// Корневой layout приложения. Подключает два шрифта дизайн-системы (шаг 38.16):
// Sofia Sans Extra Condensed — display (заголовки, цены, время), Inter — текст.
// Оба через next/font/google (self-hosted, нулевой CLS, без обращений к Google Fonts
// в проде), оба с кириллицей. Шрифты приходят переменными `--font-sofia` / `--font-inter`,
// а стеки `--ui-font-display` / `--ui-font-body` собираются в globals.css — там же,
// где живут остальные токены.
import type { Metadata } from 'next';
import { Inter, Sofia_Sans_Extra_Condensed } from 'next/font/google';

import { AppShell } from '@/components/layout';
import './globals.css';

// Sofia Sans Extra Condensed — display-шрифт: вариативный по весу (1–1000), один файл
// на все начертания; кириллица есть. `weight` не задаётся — берётся вариативная ось.
const sofia = Sofia_Sans_Extra_Condensed({
  subsets: ['cyrillic', 'latin'],
  variable: '--font-sofia',
  display: 'swap',
});

// Inter — текстовый шрифт: вариативный по весу, кириллица есть.
const inter = Inter({
  subsets: ['cyrillic', 'latin'],
  variable: '--font-inter',
  display: 'swap',
});

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
    <html lang="ru" className={`${sofia.variable} ${inter.variable}`}>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
