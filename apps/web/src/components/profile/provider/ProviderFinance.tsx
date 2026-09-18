// Phase 25 Step 25.16: Finance placeholder для провайдера — 3 пустые секции
// (Транзакции / Выплаты / Реквизиты). Реальные платежи не в scope Phase 25 —
// текущая задача только показать структуру и занять место в навигации.
'use client';

import { Badge, Card } from '@/components/ui';
import { BRAND_NAME } from '@sporthub/domain';
import { useAuthStore } from '@/stores/useAuthStore';

export function ProviderFinance() {
  const user = useAuthStore((s) => s.user);

  // ⚠️ Шаг 35.34. Здесь стояла плашка «Доступ ограничен» — косметика поверх
  // УЖЕ отданных данных: пускать или нет, решает серверный лейаут, и решает
  // до похода за ними. Осталась одна причина ничего не рисовать: ответ
  // «кто я» ещё в пути, и номера человека нет.
  if (!user) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6" data-testid="provider-finance">
      <header className="flex flex-col gap-1.5">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-muted">
          Кабинет · Финансы
        </p>
        <h1 className="font-display text-3xl font-semibold uppercase tracking-tight text-ink">
          Финансы
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted">
          Платёжная аналитика пока недоступна: платформа не получает данные об оплатах и выплатах.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-6" data-testid="provider-finance-transactions">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-xl font-semibold uppercase text-ink">Транзакции</h2>
            <Badge tone="outline">Нет данных</Badge>
          </header>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Онлайн-платежи не подключены. Лента появится после интеграции платёжного шлюза.
          </p>
        </Card>

        <Card className="p-6" data-testid="provider-finance-payouts">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-xl font-semibold uppercase text-ink">Выплаты</h2>
            <Badge tone="outline">Нет данных</Badge>
          </header>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            История выплат отсутствует. Она станет доступна после запуска эквайринга {BRAND_NAME}.
          </p>
        </Card>

        <Card className="p-6" data-testid="provider-finance-requisites">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-xl font-semibold uppercase text-ink">Реквизиты</h2>
            <Badge tone="outline">Не подключено</Badge>
          </header>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Платёжные реквизиты не собираются до подключения live-платежей.
          </p>
        </Card>
      </div>
    </div>
  );
}
