// Phase 26 Step 26.10: breadcrumb на подмаршрутах ЛК.
// На мобилках sidebar скрыт в drawer — пользователь теряет ощущение «где я».
// Ленточка «Обзор / <раздел>» даёт явный путь обратно на Dashboard.
// На самом Dashboard, при пустых items или при mismatch pathname — возвращаем null.
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cabinetSectionPath, DEFAULT_CABINET_SECTION } from '@/lib/service-faces';

import type { ProfileNavItem } from './profile-nav-items';

interface Props {
  items: ProfileNavItem[];
  /**
   * Адрес открытого кабинета: `/profile/me` либо `/profile/club/3`.
   *
   * ⚠️ Шаг 35.31. Раньше здесь стоял вид кабинета, из которого адрес собирался
   * строкой. У адресного кабинета так не выйдет: в нём есть номер лица, и без
   * него ссылка «Обзор» вела бы в кабинет без адреса.
   */
  cabinetPath: string;
}

export function ProfileBreadcrumb({ items, cabinetPath }: Props) {
  const pathname = usePathname();

  // Пустые items = ответ «кто я» ещё в пути либо лиц услуг нет вовсе. Sidebar
  // тоже пустой, вести отсюда некуда — breadcrumb лишний.
  if (items.length === 0) {
    return null;
  }

  const activeItem = items.find((item) => item.href === pathname);

  // Pathname не мэтчит ни один item (неизвестный подмаршрут) — не рендерим.
  if (!activeItem) {
    return null;
  }

  // На Dashboard breadcrumb не нужен — он и есть корень ЛК.
  if (activeItem.key === 'dashboard') {
    return null;
  }

  const dashboardHref = cabinetSectionPath(cabinetPath, DEFAULT_CABINET_SECTION);

  return (
    <nav
      aria-label="Хлебные крошки"
      data-testid="profile-breadcrumb"
      className="mb-3 text-sm text-muted"
    >
      <Link href={dashboardHref} className="transition-colors hover:text-accent">
        Обзор
      </Link>
      <span className="mx-2">/</span>
      <span className="text-ink">{activeItem.label}</span>
    </nav>
  );
}
