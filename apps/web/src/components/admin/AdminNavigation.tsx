/**
 * Навигация внутри admin-панели — segmented-control стиль (Phase 28.16).
 * Табы/ссылки на 6 разделов: Пользователи, Аналитика, Модерация, Надзор, Логи,
 * Финансы. Шестой — очередь надзора (шаг 37.44).
 *
 * Реализация:
 * — Внешний wrapper: inline-flex + bg-card-2 + 1px line-border + rounded-full
 *   + padding 6px + gap 4px. На 480 — overflow-x-auto + scrollbar-hidden,
 *   чтобы пункты не переносились на 2 строки.
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

/**
 * Какой счётчик несёт пункт меню (шаг 37.49).
 *
 * ⚠️ Признак живёт В СЛОВАРЕ пунктов, а не в разметке. До этого шага он был
 * жёстким сравнением адреса прямо в теле ссылки — `item.href === '…/moderation'`, —
 * и это работало ровно до второго счётчика: третий превратил бы разметку
 * в лестницу `if`, четвёртый — в лестницу, которую никто не решится тронуть.
 * Теперь новый счётчик — это строка в словаре и строка в `NAV_BADGES`.
 */
type AdminNavBadge = 'awaitingRecheck' | 'supervisionUnread';

const adminNavItems: ReadonlyArray<{ href: string; label: string; badge?: AdminNavBadge }> = [
  { href: '/service-portal/dashboard', label: 'Пользователи' },
  { href: '/service-portal/analytics', label: 'Аналитика' },
  { href: '/service-portal/moderation', label: 'Модерация', badge: 'awaitingRecheck' },
  // Очередь надзора (шаг 37.44): события администраторов, каталога и входа.
  // Стоит рядом с «Модерацией» намеренно — это соседние обязанности, но очереди
  // РАЗНЫЕ: там публикации, здесь письма.
  { href: '/service-portal/notifications', label: 'Надзор', badge: 'supervisionUnread' },
  { href: '/service-portal/logs', label: 'Логи' },
  { href: '/service-portal/finance', label: 'Финансы' },
];

/**
 * Как выглядит и как называется каждый счётчик.
 *
 * ⚠️ Подпись для экранного диктора обязательна и у каждого СВОЯ. Голое «3» диктору
 * не сообщает ничего, а два голых числа рядом — тем более: прогон MCP фазы 35 нашёл
 * дефект, видимый только в дереве доступности, и с тех пор подпись называет цель.
 *
 * ⚠️ Тона разные намеренно. Красный у повторной проверки — это просроченная работа
 * модератора; оранжевый у надзора — «есть непрочитанное», тот же тон, что у значка
 * уведомлений. Одинаковые тона читались бы как одна очередь.
 */
const NAV_BADGES: Record<
  AdminNavBadge,
  { readonly tone: string; readonly describe: (count: number) => string }
> = {
  awaitingRecheck: {
    tone: 'bg-danger text-white',
    describe: (count) => `Исправлено, ждёт проверки: ${count}`,
  },
  supervisionUnread: {
    tone: 'bg-orange text-ink',
    describe: (count) => `Не разобрано в очереди надзора: ${count}`,
  },
};

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
 * ⚠️ Счётчик надзора со счётчиком «Модерации» НЕ СКЛАДЫВАЕТСЯ и стоит отдельно.
 * Они считают разное: `awaitingRecheck` — публикации в очереди модерации,
 * `supervisionUnread` — письма в очереди надзора. Одно число на двоих означало бы
 * «есть N чего-то», и расхождение с любым из разделов выглядело бы дефектом,
 * оставаясь законным.
 *
 * Оба числа приходят СВОЙСТВАМИ от серверного лейаута и берутся там параллельно:
 * лейаут собирает КАЖДУЮ страницу панели, и последовательное ожидание второго
 * числа было бы задержкой на всех шести разделах сразу.
 */
export function AdminNavigation({
  awaitingRecheck = 0,
  supervisionUnread = 0,
}: {
  awaitingRecheck?: number;
  supervisionUnread?: number;
}) {
  const pathname = usePathname();

  // Числа — по тем же ключам, что и признак в словаре пунктов: разойтись
  // «какой счётчик у какого раздела» здесь негде.
  const counts: Record<AdminNavBadge, number> = { awaitingRecheck, supervisionUnread };

  return (
    <nav
      aria-label="Разделы admin-панели"
      className="scrollbar-hidden -mx-1 max-w-full overflow-x-auto"
    >
      <ul className="inline-flex items-center gap-1 rounded-full border border-line bg-card-2 p-1.5">
        {adminNavItems.map((item) => {
          const active = isItemActive(pathname, item.href);
          // Счётчик показывается только когда ему есть что сказать: вечный ноль
          // в навигации перестаёт сообщать что-либо вовсе.
          const badge = item.badge === undefined ? null : NAV_BADGES[item.badge];
          const count = item.badge === undefined ? 0 : counts[item.badge];

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
                {badge !== null && count > 0 ? (
                  <span
                    className={cn(
                      'ml-2 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] tabular-nums',
                      badge.tone,
                    )}
                    aria-label={badge.describe(count)}
                  >
                    {count}
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
