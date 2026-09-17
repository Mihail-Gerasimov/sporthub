// Корневой layout приложения. Шрифты — стек макета (шаг 38.113, решение заказчика
// по снимкам 17.09): макет объявляет Barlow Condensed 900, у которого нет кириллицы,
// и в превью русские заголовки рисуются системной Helvetica Bold, латиница — Barlow,
// цифры — DM Mono. Эталон кириллицы — **Helvetica Bold macOS** (`/System/Library/Fonts/
// Helvetica.ttc`, лицо `Helvetica-Bold`): один вес на всю кириллицу display-текста —
// в превью так рисуются и 900-е заголовки, и 700/800-е подписи. Воспроизводим дословно:
//   - Barlow Condensed (`next/font/google`, латиница, 700–900) — display латиницей;
//   - Inter 900 кириллицей — `next/font/local` с `unicode-range` кириллицы: пословная
//     подстановка; ближайший к Helvetica Bold шрифт с кириллицей, `size-adjust` 96%
//     выравнивает ширину строки (сторож `font-stack`). Лицо ОДНО, весом 900: display-текст
//     весом 700/800 (подписи меню, шапки, строк героя) кириллицей рисуется 900-м, латиница
//     в нём — Barlow 700/800; это ровно поведение превью, где Helvetica Bold тоже одна;
//   - DM Mono (`next/font/google`, 400/500) — цифры: счётчики, цены, время, рейтинги;
//   - Inter (`next/font/google`, с кириллицей) — текст.
// Знак рубля `₽` (U+20BD) у Barlow Condensed и DM Mono есть в подмножестве `latin-ext`:
// Next включает @font-face всех подмножеств с `unicode-range` (в `subsets` — только
// предзагрузка), и файл приезжает по первому знаку на странице — как в превью макета.
// Отдельный рублёвый шрифт (38.18) снят: он был нужен Sofia Sans, у которой знака не было.
// Шрифты приходят переменными `--font-*`, а стеки `--ui-font-display` / `--ui-font-body`
// / `--ui-font-mono` собираются в globals.css — там же, где живут остальные токены;
// кириллический Inter в display-стеке стоит сразу за Barlow.
import type { Metadata } from 'next';
import { BRAND_NAME } from '@sporthub/domain';
import { Barlow_Condensed, DM_Mono, Inter } from 'next/font/google';
import localFont from 'next/font/local';

import { AppShell } from '@/components/layout';
import './globals.css';

// Barlow Condensed — display-шрифт макета, латиница; кириллицы у него нет — её берёт
// следующий в стеке (Inter 900). ⚠️ `adjustFontFallback: false` и `fallback: []`:
// иначе Next вставит за Barlow подогнанный Arial, и он перехватит кириллицу раньше Inter
// (сторож `font-cyrillic`).
const barlow = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['700', '800', '900'],
  variable: '--font-barlow',
  display: 'swap',
  adjustFontFallback: false,
  fallback: [],
});

// Inter — текстовый шрифт: вариативный по весу, кириллица есть.
const inter = Inter({
  subsets: ['cyrillic', 'latin'],
  variable: '--font-inter',
  display: 'swap',
});

// DM Mono — цифры макета (счётчики, цены, время, рейтинги, номера шагов). Кириллицы
// у него нет, и в mono-стеке она сознательно системная моноширинная — как в макете
// (`'DM Mono', monospace`). ⚠️ Без `adjustFontFallback: false` / `fallback: []` Next
// вставил бы за ним Arial, растянутый на 135%, и «от» в цене рисовалось бы им.
const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-dm-mono',
  display: 'swap',
  adjustFontFallback: false,
  fallback: [],
});

// Inter 900 для кириллицы display-текста — статический экземпляр кириллического
// подмножества Inter (`scripts/build-inter-cyrillic.mjs`), только диапазон кириллицы
// (`unicode-range`): латиница и цифры остаются Barlow. `size-adjust` 96% — ширина
// «НАЙДИ ЗАЛ» сходится с Helvetica Bold превью в пределах 3% (сторож `font-stack`).
// ⚠️ `adjustFontFallback: false` и `fallback: []` — иначе за ним встанет Arial без
// `unicode-range` и перехватит всё, чего нет ни в Barlow, ни в кириллическом Inter.
const interCyrillic = localFont({
  src: [{ path: '../fonts/inter-cyrillic-900.woff2', weight: '900' }],
  variable: '--font-inter-cyr',
  display: 'swap',
  adjustFontFallback: false,
  fallback: [],
  declarations: [
    { prop: 'unicode-range', value: 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116' },
    { prop: 'size-adjust', value: '96%' },
  ],
});

export const metadata: Metadata = {
  title: BRAND_NAME,
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
      className={`${barlow.variable} ${interCyrillic.variable} ${inter.variable} ${dmMono.variable}`}
    >
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
