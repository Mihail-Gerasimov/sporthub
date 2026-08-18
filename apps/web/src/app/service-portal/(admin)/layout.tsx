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

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AdminGuard>
      <div className="w-full max-w-[1440px] px-4 py-7 sm:px-8">
        {/* Топ-полоса: навигация по разделам слева, «Открыть сайт» справа */}
        <div className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <AdminNavigation />
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
