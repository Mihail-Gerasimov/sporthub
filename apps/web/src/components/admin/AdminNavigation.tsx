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

/**
 * Навигация служебной панели.
 *
 * `awaitingRecheck` — сколько публикаций владельцы исправили и что ждёт повторной
 * проверки (шаг 36.21). Число приходит СВОЙСТВОМ от серверного лейаута, а не
 * запрашивается здесь: сервер и так собирает страницу, и второй поход из браузера
 * ради одного числа — лишний круг и лишняя точка отказа.
 *
 * ⚠️ Признак живёт в собственной поверхности администратора, а не в колокольчике
 * человека, и это не косметика. Найдено браузерным прогоном приёмки: план фазы
 * обосновывал адресата уведомления словами «колокольчик показывается любому
 * вошедшему, включая администратора». На деле `NotificationBell` для вида учётной
 * записи `admin` возвращает `null` явной строкой, лента `/profile/me/notifications`
 * закрыта `requirePerson()`, а в служебной панели колокольчика нет вовсе — то есть
 * строка уведомления создавалась и не была видна НИКОМУ.
 *
 * Завести админу человеческую ленту ради одного типа значило бы боком отменить
 * решение заказчика 13: он отстранён от базового набора человека намеренно.
 */
export function AdminNavigation({ awaitingRecheck = 0 }: { awaitingRecheck?: number }) {
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
                {item.href === '/service-portal/moderation' && awaitingRecheck > 0 ? (
                  <span
                    className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[10px] text-white"
                    aria-label={`Исправлено, ждёт проверки: ${awaitingRecheck}`}
                  >
                    {awaitingRecheck}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
