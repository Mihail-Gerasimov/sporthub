// Корневой layout приложения. Подключает два шрифта дизайн-системы (шаг 38.16):
// Sofia Sans Extra Condensed — display (заголовки, цены, время), Inter — текст.
// Оба через next/font/google (self-hosted, нулевой CLS, без обращений к Google Fonts
// в проде), оба с кириллицей. Плюс рублёвый глиф (шаг 38.18) через next/font/local:
// у Sofia знака `₽` нет, он вырезан из Barlow Condensed по одному символу на вес.
// Шрифты приходят переменными `--font-ruble` / `--font-sofia` / `--font-inter`,
// а стеки `--ui-font-display` / `--ui-font-body` собираются в globals.css — там же,
// где живут остальные токены; рубль в display-стеке стоит ПЕРВЫМ.
import type { Metadata } from 'next';
import { Inter, Sofia_Sans_Extra_Condensed } from 'next/font/google';
import localFont from 'next/font/local';

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

// Рубль `₽` из Barlow Condensed — ровно один глиф U+20BD в каждом файле
// (собирает `scripts/build-ruble-glyph.mjs`, сверяет сторож `ruble-glyph`).
// Веса объявлены на ступень ВЫШЕ файла: у Barlow штрих толще при равном весе,
// поэтому под Sofia 600 подставляется Barlow 500, под 900 — 800.
// ⚠️ Три опции обязательны, без них механизм ломается молча:
//   `adjustFontFallback: false` — иначе Next подставит Arial-fallback сразу за рублём,
//   и он перехватит весь display-текст; `fallback: []` — по той же причине;
//   `preload: false` — иначе четыре файла грузятся на странице без единой цены.
// `unicode-range` ограничивает подстановку одним символом, `size-adjust` подгоняет
// кегль Barlow под Sofia (94%).
const ruble = localFont({
  src: [
    { path: '../fonts/barlow-ruble-500.woff2', weight: '600' },
    { path: '../fonts/barlow-ruble-600.woff2', weight: '700' },
    { path: '../fonts/barlow-ruble-700.woff2', weight: '800' },
    { path: '../fonts/barlow-ruble-800.woff2', weight: '900' },
  ],
  variable: '--font-ruble',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  fallback: [],
  declarations: [
    { prop: 'unicode-range', value: 'U+20BD' },
    { prop: 'size-adjust', value: '94%' },
  ],
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
    <html lang="ru" className={`${ruble.variable} ${sofia.variable} ${inter.variable}`}>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
