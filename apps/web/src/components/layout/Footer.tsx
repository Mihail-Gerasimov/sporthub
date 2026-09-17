// Подвал площадки (шаг 38.61) — по эталону ПРОСПОРТ: тёмная плашка, логотип ссылкой
// на главную, ссылки из словаря `lib/navigation.ts` (`FOOTER_NAV`) и копирайт с именем
// площадки. Блок «Статус» и признание «ссылки работают как заглушки» сняты: подвал
// больше ни в чём не признаётся.
//
// Шаг 38.119 (Э14, дословно по макету): ссылки — свой словарь подвала ровно по
// `HomePage.tsx` ~899: Клубы · Тренеры · Маркет · Лента («Лента» и «Маркет» — на «раздел
// в разработке»); отступление 24g снято. Копирайт — «© <год> ПРОСПОРТ» как в макете;
// год из часов, а не «2025» буквами: макетный захардкожен и уже устарел (названо).
//
// Контейнер — `HomeContainer` (1320/24), как у всех секций и у подвала макета (аудит
// 17.09, п. 17): прежний потолок 1440 сдвигал содержимое на 57px к краям. Подписи
// `plate-muted` (.45 против .3/.18 макета) — принятое отступление ради AA, не трогать.
import { BRAND_NAME } from '@sporthub/domain';
import Link from 'next/link';

import { HomeContainer } from '@/components/home/HomeContainer';
import { NavLink } from '@/components/layout/NavLink';
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
      <HomeContainer className="flex flex-col gap-5 py-7 md:flex-row md:items-center md:justify-between">
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
            <NavLink
              key={link.key}
              item={link}
              className="font-body text-[12px] font-semibold text-plate-muted no-underline transition-colors hover:text-lime"
            />
          ))}
        </nav>

        <p className="m-0 font-body text-[11px] text-plate-muted">
          © {year} {BRAND_NAME}
        </p>
      </HomeContainer>
    </footer>
  );
}
