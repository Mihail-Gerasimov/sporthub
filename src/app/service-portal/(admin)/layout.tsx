/**
 * Guarded layout для внутренних admin-страниц (route group).
 * Проверяет isAuthenticated && isAdmin через AdminGuard.
 * Содержит ссылку «Открыть сайт» для навигации на главную.
 */
import Link from 'next/link';

import { AdminGuard } from '@/components/admin/AdminGuard';

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AdminGuard>
      <div className="w-full max-w-5xl">
        <nav className="mb-6 flex items-center justify-between" aria-label="Навигация admin-панели">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted">
            Сервисная панель
          </h2>
          <Link
            href="/"
            className="text-sm font-semibold text-teal transition-colors hover:text-accent"
          >
            Открыть сайт →
          </Link>
        </nav>
        {children}
      </div>
    </AdminGuard>
  );
}
