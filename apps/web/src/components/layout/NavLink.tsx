// Ссылка пункта навигации (шаг 38.79c): `next/link` плюс режим стора.
//
// Пункты «Клубы» и «Тренеры» ведут на один адрес — выдачу каталога — и различаются
// режимом `discoveryMode`: клик ставит его в сторе, как чип сегмента блока поиска,
// и переход открывает выдачу нужного вида. Пункт без `mode` стор не трогает.
// Одна ссылка на шапку, меню и подвал — иначе три копии обработчика.
//
// Текущий пункт (аудит 17.09, п. 16) отмечается `aria-current="page"`; кто текущий —
// решает потребитель (`activeNavKey` из словаря): у ссылки нет ни адреса страницы,
// ни списка соседей, а подвал и меню текущего не отмечают — им и не нужно.
//
// Почему не `ui/Button`: это пункт навигации со своим видом у каждого потребителя
// (шапка, панель меню, подвал), а не кнопка действия.
'use client';

import Link from 'next/link';
import type { ComponentProps } from 'react';

import type { NavItem } from '@/lib/navigation';
import { useFilterStore } from '@/stores/useFilterStore';

type NavLinkProps = Omit<ComponentProps<typeof Link>, 'href'> & {
  item: NavItem;
  /** Пункт — текущая страница: `aria-current="page"`. */
  isActive?: boolean;
};

export function NavLink({ item, isActive = false, onClick, ...props }: NavLinkProps) {
  const setDiscoveryMode = useFilterStore((state) => state.setDiscoveryMode);

  return (
    <Link
      href={item.href}
      aria-current={isActive ? 'page' : undefined}
      onClick={(event) => {
        if (item.mode !== undefined) setDiscoveryMode(item.mode);
        onClick?.(event);
      }}
      {...props}
    >
      {item.label}
    </Link>
  );
}
