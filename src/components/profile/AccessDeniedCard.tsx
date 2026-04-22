// Общий компонент «Доступ ограничен» для всех profile-маршрутов (Step 26.1).
// Заменяет 14 локальных копипаст в athlete/provider-обёртках. Поддерживает override
// testId для сохранения existing контракта testid-ов provider-*-access-denied.
'use client';

import Link from 'next/link';

import { Badge, Button, Card } from '@/components/ui';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';

export type AccessDeniedCardProps = {
  /** Какой роли требуется раздел — определяет role-badge и дефолтный текст сообщения. */
  requiredRole: 'athlete' | 'provider';
  /** Опциональный кастомный текст (переопределяет дефолт). */
  message?: string;
  /** Опциональный override для testid — совместимость с existing provider-*-access-denied тестами. */
  testId?: string;
};

/**
 * Универсальная карточка «Доступ ограничен» для athlete/provider profile-маршрутов.
 * Рендерит role-badge, условный session-badge при несовпадении ролей, сообщение и
 * кнопки «Войти» (для гостей) + «Вернуться на главную».
 */
export function AccessDeniedCard({ requiredRole, message, testId }: AccessDeniedCardProps) {
  const openAuthModal = useUIStore((state) => state.openAuthModal);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountType = useAuthStore((state) => state.accountType);

  // Session-бейдж показываем только когда пользователь залогинен в противоположную роль.
  const isOppositeRoleSession =
    isAuthenticated && accountType !== null && accountType !== requiredRole;

  const defaultMessage =
    requiredRole === 'provider'
      ? isAuthenticated
        ? 'Ты вошёл как спортсмен. Раздел доступен только провайдерам.'
        : 'Раздел доступен только провайдерам после входа.'
      : isAuthenticated
        ? 'Ты вошёл как представитель спортивных услуг. Раздел доступен только спортсменам.'
        : 'Раздел доступен только спортсменам после входа.';

  const resolvedMessage = message ?? defaultMessage;
  const resolvedTestId = testId ?? `profile-access-denied-${requiredRole}`;
  const roleBadgeText = requiredRole === 'provider' ? 'Provider only' : 'Athlete only';
  const sessionBadgeText = requiredRole === 'provider' ? 'Athlete session' : 'Provider session';

  return (
    <Card className="p-6 sm:p-8" data-testid={resolvedTestId}>
      <div className="flex flex-wrap gap-2">
        <Badge tone="danger">{roleBadgeText}</Badge>
        {isOppositeRoleSession ? <Badge tone="outline">{sessionBadgeText}</Badge> : null}
      </div>
      <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight text-ink">
        Доступ ограничен
      </h1>
      <p className="mt-4 text-base leading-relaxed text-muted">{resolvedMessage}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        {!isAuthenticated ? (
          <Button onClick={() => openAuthModal()}>Войти или зарегистрироваться</Button>
        ) : null}
        <Link
          href="/"
          className="inline-flex min-h-12 items-center justify-center rounded-pill border border-line bg-panel px-5 text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent"
        >
          Вернуться на главную
        </Link>
      </div>
    </Card>
  );
}
