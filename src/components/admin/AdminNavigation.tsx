/**
 * Навигация внутри admin-панели.
 * Табы/ссылки на разделы: Пользователи, Аналитика, Модерация, Финансы.
 * Активная ссылка подсвечивается по текущему pathname.
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

export function AdminNavigation() {
  const pathname = usePathname();

  return (
    <nav aria-label="Разделы admin-панели" className="flex flex-wrap gap-1">
      {adminNavItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            'rounded-pill px-4 py-2 text-sm font-semibold transition-colors',
            pathname === item.href ? 'bg-accent text-panel' : 'text-ink hover:bg-panel-strong',
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
