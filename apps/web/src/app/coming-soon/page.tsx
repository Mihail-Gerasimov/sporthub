// Страница «раздел в разработке» (шаг 38.56) — фиксированный маршрут `/coming-soon`.
//
// ⚠️ Не catch-all: с `[...rest]` любой адрес отвечал бы этой страницей, и сторож
// `menu-routes-exist` не отличил бы живой раздел от опечатки в меню. Сюда ведут
// пункты «Командные» и «Маркет» из `lib/navigation.ts` — разделы вне фазы 38
// (долги Д-7, Д-8); имя раздела страница не знает: адрес один на все.
import { BRAND_NAME } from '@sporthub/domain';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: `Раздел в разработке — ${BRAND_NAME}`,
};

export default function ComingSoonPage() {
  return (
    <main className="mx-auto flex w-full max-w-[1440px] flex-col items-start gap-6 px-4 py-16 sm:px-6 lg:px-10">
      <p className="t-eyebrow">Скоро</p>
      <h1 className="t-h1 text-ink">Раздел в разработке</h1>
      <p className="max-w-xl font-body text-base leading-relaxed text-muted">
        Этот раздел появится в следующих обновлениях. Пока здесь пусто — клубы, тренеры и ближайшие
        слоты уже ждут на главной.
      </p>
      <Link
        href="/"
        className="inline-flex items-center rounded-button border-2 border-lime bg-card px-6 py-3 font-display text-sm font-bold tracking-[0.04em] text-ink uppercase transition-colors hover:bg-lime"
      >
        На главную
      </Link>
    </main>
  );
}
