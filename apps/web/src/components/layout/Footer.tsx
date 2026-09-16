// Подвал площадки (шаг 38.61) — по эталону ПРОСПОРТ: тёмная плашка, логотип ссылкой
// на главную, ссылки из словаря `lib/navigation.ts` (те же цели, что в шапке, — и ни
// одной, которой нет) и копирайт с именем площадки. Блок «Статус» и признание «ссылки
// работают как заглушки» сняты: подвал больше ни в чём не признаётся.
import { BRAND_NAME } from '@sporthub/domain';
import Link from 'next/link';

import { BrandLogo } from '@/components/ui/BrandLogo';
import { FOOTER_NAV } from '@/lib/navigation';

export function Footer() {
  // Год — из часов, а не буквами: в макете «© 2025» захардкожен и уже устарел.
  const year = new Date().getFullYear();

  return (
    <footer
      className="border-t border-plate-line bg-plate text-plate-ink"
      aria-label="Подвал сайта"
    >
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-4 py-7 sm:px-6 md:flex-row md:items-center md:justify-between">
        <Link
          href="/"
          className="inline-flex shrink-0 text-inherit no-underline"
          aria-label="На главную"
        >
          <BrandLogo tone="plate" size="sm" />
        </Link>

        <nav
          aria-label="Навигация в подвале"
          className="flex flex-wrap items-center gap-x-5 gap-y-2"
        >
          {FOOTER_NAV.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="font-body text-[12px] font-semibold text-plate-muted no-underline transition-colors hover:text-lime"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <p className="m-0 font-body text-[11px] text-plate-muted">
          © {year} {BRAND_NAME}
        </p>
      </div>
    </footer>
  );
}
