// Sidebar-навигация кабинета: desktop-вариант (>= md). Мобильная версия — через ProfileMobileNav.
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

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

function NavIcon({ itemKey }: { itemKey: string }) {
  const paths: Record<string, ReactNode> = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    schedule: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></>,
    stats: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
    favorites: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />,
    reviews: <path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2L5.8 21 7 14.2 2 9.3l6.9-1L12 2Z" />,
    notifications: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>,
    publications: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 8h10M7 12h10M7 16h6" /></>,
    'trainer-profile': <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    bookings: <><path d="M3 7h18v13H3zM7 3v8M17 3v8" /></>,
    clients: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></>,
    links: <><path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" /><path d="M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1" /></>,
    finance: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M16 15h2" /></>,
  };

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">
      {paths[itemKey] ?? <circle cx="12" cy="12" r="8" />}
    </svg>
  );
}

export function ProfileSidebar({ items, ariaLabel, className, onItemClick }: ProfileSidebarProps) {
  const pathname = usePathname() ?? '';

  if (items.length === 0) {
    return null;
  }

  return (
    <nav
      aria-label={ariaLabel}
      className={cn('flex flex-col gap-1 rounded-[18px] bg-ink p-3 shadow-floating', className)}
    >
      {items.map((item) => {
        const active = isItemActive(item.href, pathname);

        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            onClick={onItemClick}
            className={cn(
              'relative flex min-h-11 items-center gap-3 rounded-[12px] px-3 py-2.5 text-sm font-semibold transition-colors',
              active
                ? 'bg-accent/15 text-card'
                : 'text-card/55 hover:bg-card/10 hover:text-card',
            )}
          >
            {active ? (
              <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent" />
            ) : null}
            <span className={active ? 'text-accent' : 'text-card/45'}>
              <NavIcon itemKey={item.key} />
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
