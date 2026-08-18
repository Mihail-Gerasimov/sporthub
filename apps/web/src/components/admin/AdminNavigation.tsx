/**
 * Навигация внутри admin-панели — segmented-control стиль (Phase 28.16).
 * Табы/ссылки на 5 разделов: Пользователи, Аналитика, Модерация, Логи, Финансы.
 *
 * Реализация:
 * — Внешний wrapper: inline-flex + bg-card-2 + 1px line-border + rounded-full
 *   + padding 6px + gap 4px. На 480 — overflow-x-auto + scrollbar-hidden,
 *   чтобы 5 пунктов не переносились на 2 строки.
 * — Каждая ссылка: rounded-full + px-4 py-2 + Oswald 700 11px UPPERCASE
 *   letter-spacing 0.16em + whitespace-nowrap.
 * — Активная (по `pathname.startsWith(item.href + '/')` или строгому равенству):
 *   bg-lime + text-ink. Неактивная: text-muted, hover:text-ink.
 *
 * Активность через startsWith защищает от будущих вложенных маршрутов
 * (`/service-portal/dashboard/123`) — подсветка сохраняется на детальных страницах.
 * Точное равенство `===` оставлено для случая, когда pathname идентичен href.
 */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

const adminNavItems = [
  { href: '/service-portal/dashboard', label: 'Пользователи' },
  { href: '/service-portal/analytics', label: 'Аналитика' },
  { href: '/service-portal/moderation', label: 'Модерация' },
  { href: '/service-portal/logs', label: 'Логи' },
  { href: '/service-portal/finance', label: 'Финансы' },
];

/** Проверяет, активен ли пункт навигации для текущего pathname. */
function isItemActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  // Защита от ложных совпадений: `/dashboard` не должен быть active
  // когда pathname = `/dashboard-extra`. Только при префиксе с разделителем.
  return pathname.startsWith(`${href}/`);
}

export function AdminNavigation() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Разделы admin-панели"
      className="scrollbar-hidden -mx-1 max-w-full overflow-x-auto"
    >
      <ul className="inline-flex items-center gap-1 rounded-full border border-line bg-card-2 p-1.5">
        {adminNavItems.map((item) => {
          const active = isItemActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex items-center whitespace-nowrap rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-[0.16em] transition-colors',
                  active ? 'bg-lime text-ink' : 'text-muted hover:text-ink',
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
