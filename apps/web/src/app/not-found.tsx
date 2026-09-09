// Страница «не найдено».
//
// До фазы 34 её не было вовсе: Next показывал свою служебную заглушку на
// английском, и человек, попавший на несуществующий адрес, видел чужой интерфейс
// вместо нашего.

import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-[1440px] flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Ошибка 404</p>
      <h1 className="font-display text-[clamp(1.75rem,5vw,2.75rem)] leading-tight text-ink">
        Такой страницы нет
      </h1>
      <p className="max-w-[46ch] text-[15px] leading-relaxed text-muted">
        Возможно, публикацию удалили или адрес набран с ошибкой.
      </p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 rounded-full bg-lime px-6 py-3 text-[13px] font-bold uppercase tracking-[0.12em] text-ink transition-colors hover:bg-lime-hov"
      >
        На главную
      </Link>
    </main>
  );
}
