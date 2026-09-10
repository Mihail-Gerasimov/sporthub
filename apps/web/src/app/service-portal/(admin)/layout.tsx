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
import { getAwaitingRecheckCount } from '@/lib/server-api';
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

  // Признак повторной проверки считает СЕРВЕР и отдаёт свойством: страница и так
  // собирается здесь, а второй поход из браузера ради одного числа — лишний круг.
  // Ошибка счёта не имеет права унести с собой всю панель: признак — подсказка,
  // а не содержание страницы.
  const awaitingRecheck = await getAwaitingRecheckCount().catch(() => 0);

  return (
    <AdminGuard>
      <div className="w-full max-w-[1440px] px-4 py-7 sm:px-8">
        {/* Топ-полоса: навигация по разделам слева, «Открыть сайт» справа */}
        <div className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <AdminNavigation awaitingRecheck={awaitingRecheck} />
          <Link
            href="/"
            className="inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-line bg-transparent px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-ink transition-colors hover:border-lime hover:text-lime lg:self-auto"
          >
            Открыть сайт →
          </Link>
        </div>
        {children}
      </div>
    </AdminGuard>
  );
}
