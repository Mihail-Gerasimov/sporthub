/**
 * Плашка impersonation — отображается при активном impersonation сверху всех страниц.
 * Показывает имя и ID целевого пользователя, кнопку «Вернуться в панель».
 * Размещается в AppShell ПЕРЕД Header.
 */
'use client';

import { useRouter } from 'next/navigation';

import { useAuthStore } from '@/stores/useAuthStore';

export function ImpersonationBanner() {
  const router = useRouter();
  const isImpersonating = useAuthStore((s) => s.isImpersonating);
  const user = useAuthStore((s) => s.user);
  const adminOriginalUser = useAuthStore((s) => s.adminOriginalUser);
  const stopImpersonation = useAuthStore((s) => s.stopImpersonation);

  if (!isImpersonating) return null;

  function handleReturn() {
    // Логируем завершение impersonation ПЕРЕД stopImpersonation (fire-and-forget)
    // actorId = adminOriginalUser (настоящий админ), entityId = target user
    fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'admin_impersonate_stop',
        actorId: adminOriginalUser?.id ?? 0,
        actorRole: 'admin',
        entityType: 'user',
        entityId: user?.id ?? 0,
      }),
    }).catch(() => {});

    stopImpersonation();
    router.push('/service-portal/dashboard');
  }

  return (
    <div className="border-b border-warning bg-warning px-4 py-2">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 text-sm">
        <p className="font-medium text-ink">
          Вы работаете от имени <span className="font-semibold">{user?.name}</span>{' '}
          <span className="font-mono text-muted">#{user?.id}</span>
        </p>
        <button
          type="button"
          onClick={handleReturn}
          className="rounded-pill border border-warning/40 bg-panel px-3 py-1 text-xs font-semibold text-ink transition-colors hover:border-accent hover:text-accent"
        >
          Вернуться в панель
        </button>
      </div>
    </div>
  );
}
