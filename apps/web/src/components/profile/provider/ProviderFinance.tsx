// Phase 25 Step 25.16: Finance placeholder для провайдера — 3 пустые секции
// (Транзакции / Выплаты / Реквизиты). Реальные платежи не в scope Phase 25 —
// текущая задача только показать структуру и занять место в навигации.
'use client';

import { Badge, Card } from '@/components/ui';
import { useAuthStore } from '@/stores/useAuthStore';
import { AccessDeniedCard } from '@/components/profile/AccessDeniedCard';

export function ProviderFinance() {
  const user = useAuthStore((s) => s.user);
  const accountType = useAuthStore((s) => s.accountType);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated || accountType !== 'provider' || !user) {
    return <AccessDeniedCard requiredRole="provider" testId="provider-finance-access-denied" />;
  }

  return (
    <div className="flex flex-col gap-6" data-testid="provider-finance">
      <Card className="p-6 sm:p-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Финансы</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Раздел в разработке. Здесь появятся транзакции по записям атлетов, расписание выплат и
          реквизиты для получения платежей.
        </p>
      </Card>

      <Card className="p-6 sm:p-8" data-testid="provider-finance-transactions">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-2xl font-semibold text-ink">Транзакции</h2>
          <Badge tone="outline">В разработке</Badge>
        </header>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          Лента платежей атлетов за ваши услуги — с фильтрами по offering, клиенту, периоду. Сейчас
          приём платежей ведётся offline; интеграция с платёжным шлюзом — после MVP.
        </p>
      </Card>

      <Card className="p-6 sm:p-8" data-testid="provider-finance-payouts">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-2xl font-semibold text-ink">Выплаты</h2>
          <Badge tone="outline">В разработке</Badge>
        </header>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          График и история выплат на ваш расчётный счёт. После интеграции эквайринга суммы будут
          агрегироваться автоматически с учётом комиссии SportHub.
        </p>
      </Card>

      <Card className="p-6 sm:p-8" data-testid="provider-finance-requisites">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-2xl font-semibold text-ink">Реквизиты</h2>
          <Badge tone="outline">В разработке</Badge>
        </header>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          Данные юрлица или ИП для выплат: расчётный счёт, БИК, ИНН/КПП. Редактирование появится
          одновременно с live-платежами.
        </p>
      </Card>
    </div>
  );
}
