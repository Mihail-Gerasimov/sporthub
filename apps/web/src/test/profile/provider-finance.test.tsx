// ⚠️ Фаза 35, шаг 35.34. Проверка «чужому — плашка «Доступ ограничен»» снята
// не потому, что стала не нужна, а потому, что она никогда не была защитой:
// плашка рисовалась ПОВЕРХ уже отданных данных. Настоящая проверка стоит
// в серверном лейауте, ДО похода за данными, и проверяется она набором
// `src/test/security/protected-layouts.test.ts` — там же, где проверяется
// и то, что уведённому данные не запрашивались вообще.
// Phase 25 Step 25.16: smoke-тесты ProviderFinance placeholder.
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { renderWithToast as render } from '@/test/helpers/render-with-toast';

import { ProviderFinance } from '@/components/profile/provider/ProviderFinance';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import type { User } from '@sporthub/types';

const providerUser: User = {
  id: 10,
  createdAt: '2026-01-01T00:00:00.000Z',
  role: 'club_owner',
  name: 'Ирина Провайдер',
  email: 'provider@studio.local',
  phone: '+7 999 222-33-44',
  passwordHash: 'secret',
  favoriteClubIds: [],
};

describe('ProviderFinance (Step 25.16)', () => {
  beforeEach(() => {
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
  });

  it('рендерит 3 секции для провайдера', () => {
    useAuthStore.setState({
      ...AUTH_STORE_DEFAULT_STATE,
      user: providerUser,
      accountKind: 'person',
      isAuthenticated: true,
    });
    render(<ProviderFinance />);

    expect(screen.getByTestId('provider-finance')).toBeInTheDocument();
    expect(screen.getByTestId('provider-finance-transactions')).toBeInTheDocument();
    expect(screen.getByTestId('provider-finance-payouts')).toBeInTheDocument();
    expect(screen.getByTestId('provider-finance-requisites')).toBeInTheDocument();
  });
});
