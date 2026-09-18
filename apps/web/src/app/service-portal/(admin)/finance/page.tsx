/**
 * Placeholder — Финансы. Будет реализована в будущих фазах.
 */
import { BRAND_NAME } from '@sporthub/domain';

export const metadata = {
  title: `${BRAND_NAME} — Финансы`,
};

export default function FinancePage() {
  return (
    <div className="flex w-full flex-col gap-5 sm:gap-[22px]">
      <header className="flex flex-col gap-1.5">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-muted">
          Admin · Finance
        </p>
        <h1 className="font-display text-[28px] font-semibold uppercase leading-none tracking-tight text-ink sm:text-[32px]">
          Финансы
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-[1.5] text-muted">
          Платёжные данные платформы пока не собираются.
        </p>
      </header>
      <section className="rounded-[18px] border border-line bg-card p-8 shadow-card sm:p-10">
        <span className="inline-flex rounded-full border border-line px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-muted">
          Нет данных
        </span>
        <h2 className="mt-5 font-display text-2xl font-semibold uppercase text-ink">
          Финансовая аналитика недоступна
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
          Здесь не показаны расчётные или демонстрационные суммы. Метрики появятся после подключения
          live-платежей и серверного источника транзакций.
        </p>
      </section>
    </div>
  );
}
