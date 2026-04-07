/**
 * Guarded layout для внутренних admin-страниц (route group).
 * Проверяет isAuthenticated && isAdmin через AdminGuard.
 * Содержит навигацию по разделам и ссылку «Открыть сайт».
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
      <div className="w-full max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted">
            Сервисная панель
          </h2>
          <Link
            href="/"
            className="text-sm font-semibold text-teal transition-colors hover:text-accent"
          >
            Открыть сайт →
          </Link>
        </div>
        <div className="mb-6">
          <AdminNavigation />
        </div>
        {children}
      </div>
    </AdminGuard>
  );
}
