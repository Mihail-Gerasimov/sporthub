// Секция «Настройки профиля» кабинета провайдера — read-only данные пользователя.
import { Card } from '@/components/ui';
import type { AuthSessionUser } from '@/stores/useAuthStore';

type ProviderSettingsSectionProps = {
  user: AuthSessionUser;
};

export function ProviderSettingsSection({ user }: ProviderSettingsSectionProps) {
  return (
    <Card className="p-6 sm:p-8">
      <h2 className="font-display text-2xl font-semibold text-ink">Настройки профиля</h2>

      <div className="mt-6 grid gap-4">
        {/* Аватар и имя */}
        <div className="flex items-center gap-4 rounded-card border border-line bg-canvas p-4">
          <div className="flex size-14 items-center justify-center rounded-card border border-line bg-panel text-xl font-semibold uppercase text-ink">
            {user.name.trim().charAt(0)}
          </div>
          <div>
            <p className="text-base font-semibold text-ink">{user.name}</p>
            <p className="mt-1 text-sm text-muted">Представитель спортивных услуг</p>
          </div>
        </div>

        {/* Email */}
        <div className="rounded-card border border-line bg-canvas p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">Email</p>
          <p className="mt-3 text-base font-semibold text-ink">{user.email}</p>
        </div>

        {/* Телефон */}
        <div className="rounded-card border border-line bg-canvas p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">Телефон</p>
          <p className="mt-3 text-base font-semibold text-ink">{user.phone ?? 'Не добавлен'}</p>
        </div>

        {/* Пометка read-only */}
        <div className="rounded-card border border-line bg-canvas p-4">
          <p className="text-sm leading-relaxed text-muted">Редактирование будет доступно позже</p>
        </div>
      </div>
    </Card>
  );
}
