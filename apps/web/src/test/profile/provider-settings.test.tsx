// Тесты секции «Настройки профиля» провайдер-кабинета (Step 12.6)
import { screen } from '@testing-library/react';
import { renderInFaceCabinet } from '@/test/helpers/cabinet';
import { describe, expect, it } from 'vitest';

import { ProviderSettingsSection } from '@/components/profile/ProviderSettingsSection';
import type { AuthSessionUser } from '@/stores/useAuthStore';

const user: AuthSessionUser = {
  id: 2,
  name: 'Марина Крылова',
  email: 'marina@studio.local',
  phone: '+7 999 123-45-67',
};

describe('ProviderSettingsSection', () => {
  it('рендерит заголовок и данные пользователя', () => {
    renderInFaceCabinet(<ProviderSettingsSection user={user} />);

    expect(screen.getByText('Настройки профиля')).toBeInTheDocument();
    expect(screen.getByText('Марина Крылова')).toBeInTheDocument();
    expect(screen.getByText('marina@studio.local')).toBeInTheDocument();
    expect(screen.getByText('+7 999 123-45-67')).toBeInTheDocument();
  });

  it('показывает пометку о read-only режиме', () => {
    renderInFaceCabinet(<ProviderSettingsSection user={user} />);

    expect(screen.getByText(/Редактирование будет доступно позже/)).toBeInTheDocument();
  });

  it('отображает аватар-заглушку с первой буквой имени', () => {
    renderInFaceCabinet(<ProviderSettingsSection user={user} />);

    expect(screen.getByText('М')).toBeInTheDocument();
  });

  it('показывает fallback для отсутствующего телефона', () => {
    const userNoPhone: AuthSessionUser = {
      id: 2,
      name: 'Тест',
      email: 'test@test.ru',
    };

    renderInFaceCabinet(<ProviderSettingsSection user={userNoPhone} />);

    expect(screen.getByText('Не добавлен')).toBeInTheDocument();
  });
});
