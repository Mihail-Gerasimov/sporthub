'use client';

import Link from 'next/link';

import { Badge, Button, Card } from '@/components/ui';
import { getPersonalCabinetConfig, useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';

function AthleteAccessDeniedState() {
  const openAuthModal = useUIStore((state) => state.openAuthModal);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountType = useAuthStore((state) => state.accountType);

  const message = isAuthenticated
    ? 'Ты вошёл как представитель спортивных услуг. Кабинет спортсмена недоступен.'
    : 'Кабинет спортсмена доступен только после входа.';

  return (
    <div className="min-h-screen px-6 py-8 sm:px-8 lg:px-12">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <Card className="p-6 sm:p-8">
          <div className="flex flex-wrap gap-2">
            <Badge tone="danger">Athlete only</Badge>
            {accountType === 'provider' ? <Badge tone="outline">Provider session</Badge> : null}
          </div>

          <h1 className="mt-5 font-display text-4xl font-semibold tracking-tight text-ink">
            Доступ ограничен
          </h1>
          <p className="mt-4 text-base leading-8 text-muted">{message}</p>

          <div className="mt-8 flex flex-wrap gap-3">
            {!isAuthenticated ? (
              <Button
                onClick={() => {
                  openAuthModal();
                }}
              >
                Войти или зарегистрироваться
              </Button>
            ) : null}

            <Link
              href="/"
              className="inline-flex min-h-12 items-center justify-center rounded-pill border border-line bg-panel px-5 text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent"
            >
              Вернуться на главную
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}

export function AthleteProfilePage() {
  const user = useAuthStore((state) => state.user);
  const accountType = useAuthStore((state) => state.accountType);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const cabinetConfig = getPersonalCabinetConfig(accountType);

  if (!isAuthenticated || accountType !== 'athlete' || !user) {
    return <AthleteAccessDeniedState />;
  }

  return (
    <div className="min-h-screen px-6 py-8 sm:px-8 lg:px-12">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <Card className="p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap gap-2">
                <Badge tone="success">Athlete session</Badge>
                <Badge tone="outline">{cabinetConfig?.title ?? 'Кабинет спортсмена'}</Badge>
              </div>

              <h1 className="mt-5 font-display text-4xl font-semibold tracking-tight text-ink">
                Кабинет спортсмена
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-8 text-muted">
                Базовый athlete-only кабинет уже подключён к текущему auth-flow. Следующими шагами
                сюда будут добавляться сводка, предстоящие записи, ачивки и история.
              </p>
            </div>

            <div className="flex size-20 items-center justify-center rounded-card border border-line bg-canvas text-2xl font-semibold uppercase text-ink">
              {user.name.trim().charAt(0)}
            </div>
          </div>
        </Card>

        <Card className="grid gap-4 p-6 sm:grid-cols-2 sm:p-8">
          <div className="rounded-card border border-line bg-canvas p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              Имя спортсмена
            </p>
            <p className="mt-3 text-lg font-semibold text-ink">{user.name}</p>
          </div>

          <div className="rounded-card border border-line bg-canvas p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Email</p>
            <p className="mt-3 text-lg font-semibold text-ink">{user.email}</p>
          </div>

          <div className="rounded-card border border-line bg-canvas p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Телефон</p>
            <p className="mt-3 text-lg font-semibold text-ink">
              {user.phone ?? 'Будет добавлен позже'}
            </p>
          </div>

          <div className="rounded-card border border-line bg-canvas p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              Тип кабинета
            </p>
            <p className="mt-3 text-lg font-semibold text-ink">{cabinetConfig?.title}</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
