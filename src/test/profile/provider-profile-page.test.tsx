// Тесты страницы кабинета провайдера (Steps 12.4, 13.1)
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { refreshMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: refreshMock,
  }),
}));

import { ProviderProfilePage } from '@/components/profile/ProviderProfilePage';
import {
  AUTH_STORE_DEFAULT_STATE,
  MVP_PROVIDER_USER_ID,
  useAuthStore,
} from '@/stores/useAuthStore';

describe('ProviderProfilePage', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
    refreshMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  function createJsonResponse(body: unknown, status: number) {
    return new Response(JSON.stringify(body), {
      status,
      headers: {
        'content-type': 'application/json',
      },
    });
  }

  it('показывает «Доступ ограничен» для неавторизованного пользователя', () => {
    render(<ProviderProfilePage />);

    expect(screen.getByText('Доступ ограничен')).toBeInTheDocument();
    expect(screen.getByText(/Кабинет представителя/)).toBeInTheDocument();
  });

  it('показывает «Доступ ограничен» для athlete', () => {
    useAuthStore.getState().login({
      accountType: 'athlete',
      user: { id: 1, name: 'Алексей', email: 'a@b.ru' },
    });

    render(<ProviderProfilePage />);

    expect(screen.getByText('Доступ ограничен')).toBeInTheDocument();
  });

  it('рендерит шапку и сводку для авторизованного provider', () => {
    useAuthStore.getState().login({
      accountType: 'provider',
      user: { id: MVP_PROVIDER_USER_ID, name: 'Марина Крылова', email: 'marina@studio.local' },
    });

    render(
      <ProviderProfilePage
        clubs={[
          {
            id: 1,
            createdAt: '',
            name: 'Club A',
            slug: '',
            description: '',
            shortDescription: '',
            city: '',
            address: '',
            phone: '',
            coordinates: { lat: 0, lng: 0 },
            sportIds: [],
            imageUrls: [],
            amenities: [],
            tags: [],
            rating: 4.5,
            reviewCount: 5,
            priceFrom: 0,
            distanceKm: 0,
            isFeatured: false,
            managedByUserId: MVP_PROVIDER_USER_ID,
          },
        ]}
        trainers={[
          {
            id: 1,
            createdAt: '',
            name: 'Trainer A',
            slug: '',
            bio: '',
            avatarUrl: '',
            experienceYears: 5,
            specialties: [],
            rating: 4.8,
            reviewCount: 3,
            priceFrom: 0,
            sportIds: [],
            managedByUserId: MVP_PROVIDER_USER_ID,
          },
        ]}
        bookings={[
          {
            id: 1,
            createdAt: '',
            scheduleId: 1,
            userId: 1,
            clubId: 1,
            sportId: 3,
            date: '2026-03-18',
            status: 'confirmed',
            paymentStatus: 'paid',
            totalPrice: 1100,
          },
        ]}
        reviews={[
          {
            id: 1,
            createdAt: '',
            userId: 1,
            clubId: 1,
            rating: 5,
            text: 'Отлично!',
          },
        ]}
      />,
    );

    // Шапка — имя дублируется в шапке и настройках, проверяем наличие хотя бы одного
    expect(screen.getAllByText('Марина Крылова').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Кабинет представителя')).toBeInTheDocument();

    // Сводка — 4 KPI-карточки
    expect(screen.getByTestId('provider-summary-publications')).toHaveTextContent('2');
    expect(screen.getByTestId('provider-summary-bookings')).toHaveTextContent('1');
    expect(screen.getByTestId('provider-summary-reviews')).toHaveTextContent('1');
    expect(screen.getByTestId('provider-summary-rating')).toHaveTextContent('5');
  });

  it('открывает модалку «Опубликовать клуб» по клику на кнопку', () => {
    useAuthStore.getState().login({
      accountType: 'provider',
      user: { id: MVP_PROVIDER_USER_ID, name: 'Марина', email: 'm@b.ru' },
    });

    render(<ProviderProfilePage />);

    fireEvent.click(screen.getByRole('button', { name: /Опубликовать клуб/ }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    // Заголовок модалки — h2 внутри dialog
    expect(dialog.querySelector('h2')).toHaveTextContent('Опубликовать клуб');
  });

  it('открывает модалку «Опубликовать тренера» по клику на кнопку', () => {
    useAuthStore.getState().login({
      accountType: 'provider',
      user: { id: MVP_PROVIDER_USER_ID, name: 'Марина', email: 'm@b.ru' },
    });

    render(<ProviderProfilePage />);

    fireEvent.click(screen.getByRole('button', { name: /Опубликовать тренера/ }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog.querySelector('h2')).toHaveTextContent('Опубликовать тренера');
  });

  it('закрывает модалку по клику на overlay', () => {
    useAuthStore.getState().login({
      accountType: 'provider',
      user: { id: MVP_PROVIDER_USER_ID, name: 'Марина', email: 'm@b.ru' },
    });

    render(<ProviderProfilePage />);

    // Открываем модалку клуба
    fireEvent.click(screen.getByRole('button', { name: /Опубликовать клуб/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Закрываем через overlay
    fireEvent.click(screen.getByTestId('modal-overlay'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('закрывает модалку по Escape', () => {
    useAuthStore.getState().login({
      accountType: 'provider',
      user: { id: MVP_PROVIDER_USER_ID, name: 'Марина', email: 'm@b.ru' },
    });

    render(<ProviderProfilePage />);

    // Открываем модалку тренера
    fireEvent.click(screen.getByRole('button', { name: /Опубликовать тренера/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Закрываем через Escape
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('рендерит кнопку «Выйти» и выходит по клику', () => {
    useAuthStore.getState().login({
      accountType: 'provider',
      user: { id: MVP_PROVIDER_USER_ID, name: 'Марина', email: 'm@b.ru' },
    });

    render(<ProviderProfilePage />);

    fireEvent.click(screen.getByRole('button', { name: 'Выйти' }));

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('после успешной публикации клуба показывает notice и обновляет кабинет через router.refresh', async () => {
    fetchMock.mockResolvedValue(
      createJsonResponse(
        {
          success: true,
          data: { club: { id: 12 } },
        },
        201,
      ),
    );

    useAuthStore.getState().login({
      accountType: 'provider',
      user: { id: MVP_PROVIDER_USER_ID, name: 'Марина', email: 'm@b.ru' },
    });

    render(<ProviderProfilePage />);

    fireEvent.click(screen.getByRole('button', { name: /Опубликовать клуб/ }));
    fireEvent.change(screen.getByLabelText('Название клуба'), {
      target: { value: 'FitZone Studio' },
    });
    fireEvent.change(screen.getByLabelText('Город'), { target: { value: 'Москва' } });
    fireEvent.change(screen.getByLabelText('Адрес'), {
      target: { value: 'ул. Спортивная, 10' },
    });
    fireEvent.change(screen.getByLabelText('Краткое описание'), {
      target: {
        value:
          'Современный фитнес-клуб с тренажёрным залом, групповыми программами и стабильным расписанием для новичков.',
      },
    });
    fireEvent.change(screen.getByLabelText('Телефон'), {
      target: { value: '+7 999 123-45-67' },
    });
    fireEvent.change(screen.getByLabelText('Цена от (₽)'), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Йога' }));
    fireEvent.change(screen.getByLabelText('Название занятия'), {
      target: { value: 'Утренняя йога' },
    });
    fireEvent.change(screen.getByLabelText('Дата'), {
      target: { value: '2026-04-01' },
    });
    fireEvent.change(screen.getByLabelText('Начало'), {
      target: { value: '08:00' },
    });
    fireEvent.change(screen.getByLabelText('Окончание'), {
      target: { value: '09:00' },
    });
    fireEvent.change(screen.getByLabelText('Цена (₽)'), {
      target: { value: '900' },
    });
    fireEvent.change(screen.getByLabelText('Кол-во мест'), {
      target: { value: '15' },
    });
    fireEvent.change(screen.getByLabelText('Зал'), {
      target: { value: 'Зал №1' },
    });
    fireEvent.change(screen.getByLabelText('Направление'), {
      target: { value: 'Йога' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Создать публикацию' }));

    await waitFor(() => {
      expect(refreshMock).toHaveBeenCalledTimes(1);
    });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Клуб опубликован. Кабинет обновлён.');
  });
});
