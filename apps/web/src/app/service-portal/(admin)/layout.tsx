/**
 * Guarded layout для внутренних admin-страниц (route group).
 * Проверяет isAuthenticated && isAdmin через AdminGuard.
 *
 * Phase 28.16:
 * — контейнер расширен с max-w-5xl до max-w-[1440px] (под новый дизайн);
 * — H2 «Сервисная панель» удалён (роль перешла к sec-head на каждой странице);
 * — ссылка «Открыть сайт →» в стиле btn-ghost (rounded-full + line-border + lime hover);
 * — AdminNavigation в одну строку справа от ссылки на десктопе, ниже на мобилке.
 */
import Link from 'next/link';

import { AdminGuard } from '@/components/admin/AdminGuard';
import { AdminNavigation } from '@/components/admin/AdminNavigation';
import { SUPERVISION_MAILBOX } from '@/lib/notification-mailbox';
import { getAwaitingRecheckCount, getUnreadNotificationsCount } from '@/lib/server-api';
import { requireAdmin } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // ⚠️ Серверная проверка (фаза 34). Прежний `AdminGuard` работает в браузере,
  // и до его срабатывания страница успевала загрузить список ВСЕХ пользователей
  // платформы, записи, клубы и тренеров — и отдать их в поток ответа. Гость
  // видел перенаправление, но данные к нему уже уехали.
  //
  // `AdminGuard` остаётся: он рисует состояние в браузере и уводит при потере
  // сессии без перезагрузки. Защитой он больше не является.
  // ⚠️ Шаг 35.20. Признак сменился с роли на вид учётной записи, сама проверка
  // осталась на месте и стоит ДО чтения данных: иначе гость получил бы сводку
  // площадки в потоке ответа, а плашка нарисовалась бы поверх.
  await requireAdmin();

  // Признаки разделов считает СЕРВЕР и отдаёт свойствами: страница и так
  // собирается здесь, а поход из браузера ради одного числа — лишний круг.
  // Ошибка счёта не имеет права унести с собой всю панель: признак — подсказка,
  // а не содержание страницы.
  //
  // ⚠️ Оба числа берутся ПАРАЛЛЕЛЬНО (шаг 37.49). Лейаут собирает КАЖДУЮ страницу
  // панели, и последовательное ожидание второго счётчика стало бы задержкой
  // на всех шести разделах сразу — за признак, который никто не просил.
  //
  // ⚠️ Складывать их нельзя: `awaitingRecheck` — публикации в очереди модерации,
  // второе число — письма в очереди надзора. Одно число на двоих означало бы
  // «есть N чего-то».
  const [awaitingRecheck, supervisionUnread] = await Promise.all([
    getAwaitingRecheckCount().catch(() => 0),
    // Ящик назван явно: без имени запрос означал бы личную почту администратора,
    // которой у него не бывает, — то есть вечный ноль.
    getUnreadNotificationsCount(SUPERVISION_MAILBOX).catch(() => 0),
  ]);

  return (
    <AdminGuard>
      <div className="w-full max-w-[1440px] px-4 py-5 sm:px-6 lg:py-7">
        <div className="grid items-start gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-7">
          <aside className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-6">
            <div className="hidden rounded-[18px] border border-line bg-card p-4 shadow-card lg:block">
              <div className="flex size-11 items-center justify-center rounded-[12px] bg-lime font-display text-lg font-semibold text-ink">
                A
              </div>
              <p className="mt-3 font-display text-lg font-semibold uppercase text-ink">
                Сервисная панель
              </p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-muted">
                Управление платформой
              </p>
            </div>
            <AdminNavigation
              awaitingRecheck={awaitingRecheck}
              supervisionUnread={supervisionUnread}
            />
            <Link
              href="/"
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 self-start rounded-[12px] border border-line bg-card px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-ink shadow-card transition-colors hover:border-lime hover:text-lime-hov lg:w-full"
            >
              Открыть сайт →
            </Link>
          </aside>
          <main className="min-w-0">{children}</main>
        </div>
      </div>
    </AdminGuard>
  );
}
