/**
 * Проверка доступа в сервисную панель на стороне браузера.
 *
 * ⚠️ Это НЕ защита — она стоит в лейауте `service-portal/(admin)/layout.tsx`
 * (`requireRole(['admin'])`) и на бэкенде. Здесь решается другое: что показывать,
 * если сессия потерялась уже после открытия страницы — не оставлять же человека
 * смотреть на данные, которых он больше не получит.
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
  const status = useAuthStore((s) => s.status);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isAdmin = useAuthStore((s) => s.isAdmin);

  const hasAccess = isAuthenticated && isAdmin;
  // ⚠️ Пока ответ «кто я» не пришёл, решать нельзя. До фазы 34 личность лежала
  // в localStorage и была известна к первой отрисовке; теперь её приносит запрос,
  // и без этого условия администратор на перезагрузке страницы выкидывался бы
  // на форму входа — стор в этот момент ещё пуст.
  const isResolved = status === 'ready';

  useEffect(() => {
    if (isResolved && !hasAccess) {
      router.replace('/service-portal');
    }
  }, [hasAccess, isResolved, router]);

  if (!hasAccess) return null;

  return <>{children}</>;
}
