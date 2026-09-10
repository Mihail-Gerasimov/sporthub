// ⚠️ Фаза 35, шаг 35.34. Проверка «чужому — плашка «Доступ ограничен»» снята
// не потому, что стала не нужна, а потому, что она никогда не была защитой:
// плашка рисовалась ПОВЕРХ уже отданных данных. Настоящая проверка стоит
// в серверном лейауте, ДО похода за данными, и проверяется она набором
// `src/test/security/protected-layouts.test.ts` — там же, где проверяется
// и то, что уведённому данные не запрашивались вообще.
// Smoke-тесты client-обёрток Step 25.14-A: ProviderPublications / ProviderReviews /
// ProviderSettings. Проверяем access-gate и базовый рендер без падений.
import { screen } from '@testing-library/react';
import { renderInFaceCabinet } from '@/test/helpers/cabinet';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Phase 26 Step 26.4: ProviderPublications теперь использует useRouter для router.refresh
// после delete/edit-success — тесту нужен моковый router, иначе invariant-падение.
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

import { ProviderPublications } from '@/components/profile/provider/ProviderPublications';
import { ProviderReviews } from '@/components/profile/provider/ProviderReviews';
import { ProviderSettings } from '@/components/profile/provider/ProviderSettings';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import type { User } from '@sporthub/types';

const providerUser: User = {
  id: 10,
  createdAt: '2026-01-01T00:00:00.000Z',
  name: 'Ирина Провайдер',
  email: 'provider@studio.local',
  phone: '+7 999 222-33-44',
  passwordHash: 'secret',
  favoriteClubIds: [],
};

function authProvider() {
  useAuthStore.setState({
    ...AUTH_STORE_DEFAULT_STATE,
    user: providerUser,
    accountKind: 'person',
    isAuthenticated: true,
  });
}

describe('ProviderPublications (Step 25.14-A)', () => {
  beforeEach(() => {
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
  });

  it('рендерит раздел для провайдера', () => {
    authProvider();
    renderInFaceCabinet(<ProviderPublications clubs={[]} trainers={[]} />);
    expect(screen.getByTestId('provider-publications')).toBeInTheDocument();
  });
});

describe('ProviderReviews (Step 25.14-A)', () => {
  beforeEach(() => {
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
  });

  it('рендерит раздел для провайдера', () => {
    authProvider();
    renderInFaceCabinet(<ProviderReviews reviews={[]} clubs={[]} trainers={[]} />);
    expect(screen.getByTestId('provider-reviews')).toBeInTheDocument();
  });
});

describe('ProviderSettings (Step 25.14-A)', () => {
  beforeEach(() => {
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
  });

  it('рендерит раздел для провайдера', () => {
    authProvider();
    renderInFaceCabinet(<ProviderSettings />);
    expect(screen.getByTestId('provider-settings')).toBeInTheDocument();
  });
});
