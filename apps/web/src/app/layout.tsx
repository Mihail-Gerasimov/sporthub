// Корневой layout приложения. Подключает 3 шрифта дизайн-системы SportHub
// (Bowlby One — display, Oswald — body, JetBrains Mono — mono) через next/font/google
// (self-hosted, нулевой CLS, без обращений к Google Fonts в проде) и оборачивает
// контент в <AppShell> (Header + ToastStack + ImpersonationBanner + MobileNav).
// CSS-переменные шрифтов (--ui-font-display / --ui-font-body / --ui-font-mono)
// потребляются в globals.css и доступны как var(--ui-font-*) во всех компонентах.
import type { Metadata } from 'next';
import { Bowlby_One, JetBrains_Mono, Oswald } from 'next/font/google';

import { AppShell } from '@/components/layout';
import './globals.css';

// Bowlby One — единственный display-шрифт SportHub (H1, hero-надписи, лого, цифры).
// Один вес 400 — других у этого шрифта нет.
// ВНИМАНИЕ: Bowlby One на Google Fonts имеет ТОЛЬКО latin subset, кириллицы нет.
// Русские заголовки (H1 «Найди спорт в своём ритме») отрисуются через fallback Impact.
// Если визуальное расхождение латинских и кириллических заголовков критично — в
// следующей фазе заменим Bowlby на Russo One / Anton (русский heavy display).
const bowlbyOne = Bowlby_One({
  subsets: ['latin'],
  weight: '400',
  variable: '--ui-font-display',
  display: 'swap',
});

// Oswald — основной body-шрифт SportHub (H3-H6, body, кнопки, навигация, бэйджи).
// 4 веса покрывают типографическую шкалу из UI Kit.
const oswald = Oswald({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700'],
  variable: '--ui-font-body',
  display: 'swap',
});

// JetBrains Mono — служебный mono-шрифт (токены, hex-коды, технические данные).
// 2 веса 400 и 500 для основного и акцентного начертаний.
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--ui-font-mono',
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
    <html
      lang="ru"
      className={`${bowlbyOne.variable} ${oswald.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
