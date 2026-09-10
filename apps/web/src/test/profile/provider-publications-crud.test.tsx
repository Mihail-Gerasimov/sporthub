// Phase 26 Step 26.4: тесты CRUD в ProviderPublications.
// После переноса state/handlers publish-модалок из корневого ProviderProfilePage
// компонент поддерживает edit (fetch /api/clubs/[id] или /api/trainers/[id] +
// открытие модалки) и delete (confirm + DELETE + toast). Существующий smoke-тест
// access-denied в provider-publications-reviews-settings.test.tsx остаётся.
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithToast as render } from '@/test/helpers/render-with-toast';

const { refreshMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: refreshMock,
  }),
}));

import { ProviderPublications } from '@/components/profile/provider/ProviderPublications';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import { facesOf } from '@/test/helpers/service-faces';
import type { Club, Trainer } from '@sporthub/types';

// ⚠️ Фаза 35, шаг 35.34. Прав вошедшего в разделе больше нет: `manage_own_clubs`
// и `manage_own_trainer_profile` исчезли вместе с ролями. Раздел показывает то,
// чем человек ВЛАДЕЕТ, — списки клубов и карточек и есть это владение.

const providerClub: Club = {
  id: 1,
  createdAt: '2026-03-17T09:00:00.000Z',
  name: 'Volna Aquatic Club',
  slug: 'volna',
  description: 'Клуб плавания',
  shortDescription: 'Плавание',
  city: 'Самара',
  address: 'ул. Набережная, 8',
  phone: '+7 999 123-45-67',
  email: 'info@volna.local',
  coordinates: { lat: 0, lng: 0 },
  sportIds: [3],
  imageUrls: [],
  amenityIds: [],
  tagIds: [],
  rating: 4.8,
  reviewCount: 10,
  priceFrom: 900,
  managedByUserId: 2,
};

const providerTrainer: Trainer = {
  id: 1,
  createdAt: '2026-03-17T09:00:00.000Z',
  name: 'Марина Соколова',
  slug: 'marina-sokolova',
  bio: 'Тренер',
  avatarUrl: '',
  experienceYears: 9,
  specialtyIds: [],
  workFormatIds: [],
  rating: 4.9,
  reviewCount: 3,
  priceFrom: 1400,
  sportIds: [3],
  city: 'Самара',
  managedByUserId: 2,
};

function loginAsProvider() {
  useAuthStore.setState({
    ...AUTH_STORE_DEFAULT_STATE,
    user: { id: 2, name: 'Марина', email: 'marina@studio.local' },
    accountKind: 'person',
    isAuthenticated: true,
    // ⚠️ Шаг 35.20a. Свои лица приезжают ответом «кто я», а не выводятся
    // из каталога: номер владельца из публичной выдачи ушёл. Чужой клуб 99
    // в списке лиц отсутствует — на этом и держится проверка «чужое не своё».
    faces: facesOf({ userId: 2, clubs: [providerClub], trainers: [providerTrainer] }),
  });
}

function createJsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('ProviderPublications CRUD (Step 26.4)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
    refreshMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('правка предлагается по ВСЕМ своим лицам — и по клубу, и по карточке', () => {
    // ⚠️ Шаг 35.34. Прежде здесь ожидалась ровно ОДНА кнопка: право роли
    // отменяло второе владение, и владелец клуба своей карточки тренера
    // не видел (дефект 4.6 № 1 в интерфейсном виде). Оба лица принадлежат
    // одному человеку — оба и показываются.
    loginAsProvider();
    render(<ProviderPublications clubs={[providerClub]} trainers={[providerTrainer]} />);

    expect(screen.getAllByRole('button', { name: 'Редактировать' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Удалить' })).toHaveLength(2);
    expect(screen.getByText('Volna Aquatic Club')).toBeInTheDocument();
    expect(screen.getByText('Марина Соколова')).toBeInTheDocument();
    // Плашки «Редактирование через корневой кабинет» быть не должно
    expect(screen.queryByText(/корневой кабинет/i)).not.toBeInTheDocument();
  });

  it('чужие публикации в разделе не показываются', () => {
    // Контроль к проверке выше: показывается ВЛАДЕНИЕ, а не всё подряд.
    loginAsProvider();
    render(
      <ProviderPublications
        clubs={[{ ...providerClub, id: 99, name: 'Чужой клуб', managedByUserId: 777 }]}
        trainers={[]}
      />,
    );

    expect(screen.queryByText('Чужой клуб')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Редактировать' })).not.toBeInTheDocument();
  });

  it('завести лицо услуг может любой вошедший — обе кнопки на месте', () => {
    // ⚠️ Прежде кнопку прятало право роли, и завести себе карточку тренера
    // владелец клуба не мог вовсе. Решение заказчика 1: лицо заводит любой.
    loginAsProvider();
    render(<ProviderPublications clubs={[]} trainers={[]} />);

    expect(screen.getByRole('button', { name: 'Опубликовать клуб' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Опубликовать тренера' })).toBeInTheDocument();
  });

  it('клик «Редактировать» на клубе шлёт GET /api/clubs/1 и открывает модалку', async () => {
    fetchMock.mockResolvedValue(
      createJsonResponse(
        {
          success: true,
          data: {
            club: {
              ...providerClub,
              imageUrls: [],
            },
            primaryOffering: {
              id: 10,
              clubId: providerClub.id,
              ownerType: 'club',
              ownerId: providerClub.id,
              title: 'Плавание',
              sportId: 3,
              format: 'group',
              durationMinutes: 60,
              capacity: 10,
              price: 900,
              sessionLevel: 'beginner',
              cancellationPolicy: 'free_until_24h',
            },
            schedule: [],
          },
        },
        200,
      ),
    );
    loginAsProvider();

    render(<ProviderPublications clubs={[providerClub]} trainers={[]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/clubs/1');
    });
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('h2')).toHaveTextContent(/Редактировать клуб/i);
  });

  it('клик «Удалить» с confirm=true шлёт DELETE /api/clubs/1 и показывает toast success', async () => {
    const confirmMock = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fetchMock.mockResolvedValue(createJsonResponse({ success: true }, 200));
    loginAsProvider();

    render(<ProviderPublications clubs={[providerClub]} trainers={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/clubs/1', { method: 'DELETE' });
    });
    await waitFor(() => {
      expect(refreshMock).toHaveBeenCalled();
    });
    // ⚠️ Шаг 35.24a: сообщение обязано говорить, что произошло на самом деле.
    // «Удалена» врало бы: лицо спрятано, а отзывы и записи людей на месте.
    expect(screen.getByRole('status')).toHaveTextContent(/Публикация убрана из каталога/i);

    confirmMock.mockRestore();
  });

  it('клик «Удалить» с confirm=false не шлёт fetch', () => {
    const confirmMock = vi.spyOn(window, 'confirm').mockReturnValue(false);
    loginAsProvider();

    render(<ProviderPublications clubs={[providerClub]} trainers={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));

    expect(fetchMock).not.toHaveBeenCalled();
    confirmMock.mockRestore();
  });

  it('DELETE с 403 → toast error, без refresh', async () => {
    const confirmMock = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fetchMock.mockResolvedValue(createJsonResponse({ success: false, error: 'Нет прав' }, 403));
    loginAsProvider();

    render(<ProviderPublications clubs={[providerClub]} trainers={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/clubs/1', { method: 'DELETE' });
    });
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/Нет прав/i);
    });
    expect(refreshMock).not.toHaveBeenCalled();

    confirmMock.mockRestore();
  });

  it('GET /api/clubs/1 с error → toast error, модалка не открывается', async () => {
    fetchMock.mockResolvedValue(createJsonResponse({ success: false, error: 'Не найдено' }, 404));
    loginAsProvider();

    render(<ProviderPublications clubs={[providerClub]} trainers={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/Не найдено/i);
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
