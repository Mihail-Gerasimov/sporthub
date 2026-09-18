/**
 * Страница входа в сервисную панель (/service-portal).
 * Скрытый маршрут — не доступен из основной навигации.
 * Содержит фейк-форму логин/пароль для admin seed-пользователя.
 */
import { ServicePortalLoginForm } from '@/components/admin/ServicePortalLoginForm';
import { BRAND_NAME } from '@sporthub/domain';

export const metadata = {
  title: `${BRAND_NAME} — Сервисная панель`,
};

export default function ServicePortalPage() {
  return (
    <div className="w-full max-w-md">
      <div className="overflow-hidden rounded-[20px] border border-line bg-card shadow-floating">
        <div className="bg-ink px-8 py-7">
          <div className="flex size-11 items-center justify-center rounded-[12px] bg-lime font-display text-lg font-semibold text-ink">
            A
          </div>
          <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.2em] text-card/45">
            Admin access
          </p>
          <h1 className="mt-2 font-display text-2xl font-semibold uppercase tracking-tight text-card">
            Сервисная панель
          </h1>
          <p className="mt-2 text-sm text-card/55">Вход для администратора {BRAND_NAME}</p>
        </div>

        <div className="p-8">
          <ServicePortalLoginForm />
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-muted">
        Эта страница доступна только администраторам платформы.
      </p>
    </div>
  );
}
