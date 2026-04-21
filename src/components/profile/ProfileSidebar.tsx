// Sidebar-навигация кабинета: desktop-вариант (>= md). Мобильная версия — через ProfileMobileNav.
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

import type { ProfileNavItem } from './profile-nav-items';

interface ProfileSidebarProps {
  /** Готовый список разделов (уже отфильтрованный под данные пользователя). */
  items: ProfileNavItem[];
  /** Для aria-label; у athlete и provider свои подписи. */
  ariaLabel: string;
  /** Доп. className для контейнера (например, позиционирование в layout). */
  className?: string;
  /** Колбэк после клика по ссылке (для закрытия mobile-drawer после перехода). */
  onItemClick?: () => void;
}

/** Подсвечиваем пункт, если pathname совпадает или является подпутём item.href. */
function isItemActive(itemHref: string, pathname: string): boolean {
  if (pathname === itemHref) {
    return true;
  }

  return pathname.startsWith(`${itemHref}/`);
}

export function ProfileSidebar({ items, ariaLabel, className, onItemClick }: ProfileSidebarProps) {
  const pathname = usePathname() ?? '';

  if (items.length === 0) {
    return null;
  }

  return (
    <nav aria-label={ariaLabel} className={cn('flex flex-col gap-1', className)}>
      {items.map((item) => {
        const active = isItemActive(item.href, pathname);

        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            onClick={onItemClick}
            className={cn(
              'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-accent text-panel'
                : 'text-ink-muted hover:bg-panel-strong hover:text-ink',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
