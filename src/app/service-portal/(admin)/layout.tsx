/**
 * Guarded layout для внутренних admin-страниц (route group).
 * Проверяет isAuthenticated && isAdmin через AdminGuard.
 * Все страницы внутри /service-portal/(admin)/ защищены этим guard'ом.
 */
import { AdminGuard } from '@/components/admin/AdminGuard';

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <AdminGuard>{children}</AdminGuard>;
}
