/**
 * Client-side guard для admin-панели.
 * Проверяет isAuthenticated && isAdmin из auth store.
 * Если условие не выполнено — redirect на /service-portal (страницу входа).
 */
'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { useAuthStore } from '@/stores/useAuthStore';

type AdminGuardProps = {
  children: ReactNode;
};

export function AdminGuard({ children }: AdminGuardProps) {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isAdmin = useAuthStore((s) => s.isAdmin);

  const hasAccess = isAuthenticated && isAdmin;

  useEffect(() => {
    if (!hasAccess) {
      router.replace('/service-portal');
    }
  }, [hasAccess, router]);

  if (!hasAccess) return null;

  return <>{children}</>;
}
