/**
 * Страница входа в сервисную панель (/service-portal).
 * Скрытый маршрут — не доступен из основной навигации.
 * Содержит фейк-форму логин/пароль для admin seed-пользователя.
 */
import { ServicePortalLoginForm } from '@/components/admin/ServicePortalLoginForm';

export const metadata = {
  title: 'SportHub — Сервисная панель',
};

export default function ServicePortalPage() {
  return (
    <div className="w-full max-w-md">
      <div className="rounded-card border border-line bg-panel p-8 shadow-card">
        <div className="mb-6 text-center">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
            Сервисная панель
          </h1>
          <p className="mt-2 text-sm text-muted">Вход для администратора SportHub</p>
        </div>

        <ServicePortalLoginForm />
      </div>

      <p className="mt-4 text-center text-xs text-muted">
        Эта страница доступна только администраторам платформы.
      </p>
    </div>
  );
}
