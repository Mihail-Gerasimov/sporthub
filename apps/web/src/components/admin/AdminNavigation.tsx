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
 * ⚠️ Как этот счётчик здесь оказался — и почему он больше не единственная
 * поверхность администратора (шаг 37.58).
 *
 * Фаза 36 завела ровно один надзорный тип уведомления — «владелец исправил скрытую
 * публикацию», — и показать его было негде. Браузерный прогон приёмки нашёл, что
 * строка создавалась и не была видна НИКОМУ: `NotificationBell` для вида учётной
 * записи `admin` возвращал `null` явной строкой, лента `/profile/me/notifications`
 * закрыта `requirePerson()`, а в служебной панели колокольчика не было вовсе.
 * План фазы при этом утверждал обратное — «колокольчик показывается любому
 * вошедшему, включая администратора». Признак и переехал сюда, в собственную
 * поверхность панели.
 *
 * Для ОДНОГО типа числа хватало: оно говорит «есть N штук», переход ведёт в раздел
 * с готовым отбором. Фаза 37 завела надзорных типов больше одного, и число
 * перестало быть ответом — оно не скажет, ЧТО произошло, не покажет порядок
 * и не даст отметить разобранное. Поэтому у администратора появилась СВОЯ лента:
 * очередь надзора отдельным разделом панели, и колокольчик, ведущий в неё же.
 *
 * ⚠️ Решение заказчика 13 фазы 35 этим НЕ отменено, и прежний комментарий здесь
 * ошибался, говоря «ленты у администратора нет и быть не должно». Не должно быть
 * ЧЕЛОВЕЧЕСКОЙ — записей, связей, отзывов о нём: от базового набора человека
 * он отстранён намеренно. Надзорная лента — другой ящик: механизм тот же,
 * содержание разное, и это различие держит всю фазу.
 *
 * Счётчик надзора со счётчиком «Модерации» не складывается: очереди разные,
 * и одно число на двоих означало бы «есть N чего-то».
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
