// Тесты страницы кабинета провайдера (Steps 12.4, 13.1, 15.6)
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
  const providerClub = {
    id: 1,
    createdAt: '2026-03-17T09:00:00.000Z',
    name: 'Volna Aquatic Club',
    slug: 'volna',
    description:
      'Современный клуб водных видов спорта с длинным бассейном, детскими группами и персональными программами.',
    shortDescription: 'Клуб плавания и акваподготовки',
    city: 'Самара',
    address: 'ул. Набережная, 8',
    phone: '+7 999 123-45-67',
    email: 'info@volna.local',
    coordinates: { lat: 0, lng: 0 },
    sportIds: [3],
    imageUrls: [],
    amenityIds: [1],
    tagIds: [1],
    rating: 4.8,
    reviewCount: 10,
    priceFrom: 900,
    distanceKm: 1.8,
    isFeatured: true,
    managedByUserId: MVP_PROVIDER_USER_ID,
  };
  const providerTrainer = {
    id: 1,
    createdAt: '2026-03-17T09:00:00.000Z',
    name: 'Марина Соколова',
    slug: 'marina-sokolova',
    bio: 'Персональный тренер по плаванию и общей физической подготовке.',
    avatarUrl: '',
    experienceYears: 9,
    specialtyIds: [1],
    workFormatIds: [1],
    rating: 4.9,
    reviewCount: 3,
    priceFrom: 1400,
    sportIds: [3],
    city: 'Самара',
    address: 'ул. Спортивная, 10',
    affiliatedClubId: 99,
    managedByUserId: MVP_PROVIDER_USER_ID,
  };

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

  function loginAsProvider() {
    useAuthStore.getState().login({
      accountType: 'provider',
      user: { id: MVP_PROVIDER_USER_ID, name: 'Марина', email: 'm@b.ru' },
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
            amenityIds: [],
            tagIds: [],
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
            specialtyIds: [],
            workFormatIds: [1],
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
            date: '2099-03-18',
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

  it('в пустом состоянии показывает empty-state блока «Мои публикации»', () => {
    useAuthStore.getState().login({
      accountType: 'provider',
      user: { id: MVP_PROVIDER_USER_ID, name: 'Марина', email: 'm@b.ru' },
    });

    render(<ProviderProfilePage clubs={[]} trainers={[]} />);

    expect(screen.getByTestId('provider-publications-empty')).toHaveTextContent(
      'У вас пока нет публикаций',
    );
  });

  it('в пустом состоянии рендерит KPI без fake-значений', () => {
    useAuthStore.getState().login({
      accountType: 'provider',
      user: { id: MVP_PROVIDER_USER_ID, name: 'Марина', email: 'm@b.ru' },
    });

    render(<ProviderProfilePage clubs={[]} trainers={[]} bookings={[]} reviews={[]} />);

    expect(screen.getByTestId('provider-summary-publications')).toHaveTextContent('0');
    expect(screen.getByTestId('provider-summary-bookings')).toHaveTextContent('0');
    expect(screen.getByTestId('provider-summary-reviews')).toHaveTextContent('0');
    expect(screen.getByTestId('provider-summary-rating')).toHaveTextContent('0');
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

  it('сначала загружает club edit-context и только потом открывает edit-модалку', async () => {
    let resolveBootstrap: ((value: Response) => void) | undefined;

    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveBootstrap = resolve;
        }),
    );

    loginAsProvider();

    render(<ProviderProfilePage clubs={[providerClub]} trainers={[]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }));

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/clubs/1');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    resolveBootstrap?.(
      createJsonResponse(
        {
          success: true,
          data: {
            club: providerClub,
            primaryOffering: {
              id: 10,
              createdAt: '2026-03-17T09:00:00.000Z',
              ownerType: 'club',
              ownerId: 1,
              sportId: 3,
              title: 'Утренняя йога',
              description: 'Групповое занятие для начинающих и продолжающих.',
              format: 'group',
              price: 900,
              durationMinutes: 60,
              capacity: 15,
              address: 'ул. Набережная, 8',
              coordinates: { lat: 0, lng: 0 },
            },
            schedule: [
              {
                id: 21,
                createdAt: '2026-03-17T09:00:00.000Z',
                clubId: 1,
                sportId: 3,
                title: 'Утренняя йога',
                date: '2026-04-01',
                startTime: '08:00',
                endTime: '09:00',
                durationMinutes: 60,
                level: 'all_levels',
                capacity: 15,
                bookedCount: 0,
                price: 900,
                room: 'Зал №1',
              },
            ],
          },
        },
        200,
      ),
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    const dialog = screen.getByRole('dialog');

    expect(dialog.querySelector('h2')).toHaveTextContent('Редактировать клуб');
    expect(screen.getByDisplayValue('Volna Aquatic Club')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сохранить изменения' })).toBeInTheDocument();
  });

  it('открывает edit-модалку тренера и сохраняет привязанный клуб из bootstrap-контекста', async () => {
    fetchMock.mockResolvedValue(
      createJsonResponse(
        {
          success: true,
          data: {
            trainer: providerTrainer,
            affiliatedClub: {
              id: 99,
              name: 'Wave Arena',
            },
            primaryOffering: {
              id: 22,
              createdAt: '2026-03-17T09:00:00.000Z',
              ownerType: 'trainer',
              ownerId: 1,
              affiliatedClubId: 99,
              sportId: 3,
              title: 'Персональная тренировка',
              description: 'Индивидуальная работа над техникой и выносливостью.',
              format: 'personal',
              price: 1400,
              durationMinutes: 60,
              capacity: 1,
              address: 'Wave Arena',
              coordinates: { lat: 0, lng: 0 },
            },
            schedule: [
              {
                id: 31,
                createdAt: '2026-03-17T09:00:00.000Z',
                trainerId: 1,
                sportId: 3,
                title: 'Персональная тренировка',
                date: '2026-04-02',
                startTime: '10:00',
                endTime: '11:00',
                durationMinutes: 60,
                level: 'all_levels',
                capacity: 1,
                bookedCount: 0,
                price: 1400,
                room: 'Бассейн 25м',
              },
            ],
          },
        },
        200,
      ),
    );

    loginAsProvider();

    render(<ProviderProfilePage clubs={[]} trainers={[providerTrainer]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    const dialog = screen.getByRole('dialog');
    const affiliatedClubOption = screen.getByRole('option', { name: 'Wave Arena' });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/trainers/1');
    expect(dialog.querySelector('h2')).toHaveTextContent('Редактировать тренера');
    expect(screen.getByDisplayValue('Марина')).toBeInTheDocument();
    expect(affiliatedClubOption).toBeInTheDocument();
    expect((affiliatedClubOption as HTMLOptionElement).selected).toBe(true);
  });

  it('сохраняет delete-flow после подключения action «Редактировать»', async () => {
    const confirmMock = vi.spyOn(window, 'confirm').mockReturnValue(true);

    fetchMock.mockResolvedValue(createJsonResponse({ success: true }, 200));

    loginAsProvider();

    render(<ProviderProfilePage clubs={[providerClub]} trainers={[]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/clubs/1', { method: 'DELETE' });
    });

    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('Публикация удалена');

    confirmMock.mockRestore();
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

  it('обновляет счётчик публикаций после появления новых реальных сущностей в props', () => {
    useAuthStore.getState().login({
      accountType: 'provider',
      user: { id: MVP_PROVIDER_USER_ID, name: 'Марина', email: 'm@b.ru' },
    });

    const { rerender } = render(
      <ProviderProfilePage clubs={[]} trainers={[]} bookings={[]} reviews={[]} />,
    );

    expect(screen.getByTestId('provider-summary-publications')).toHaveTextContent('0');

    rerender(
      <ProviderProfilePage
        clubs={[
          {
            id: 1,
            createdAt: '',
            name: 'FitZone Studio',
            slug: 'fitzone-studio',
            description: '',
            shortDescription: '',
            city: 'Самара',
            address: '',
            phone: '',
            coordinates: { lat: 0, lng: 0 },
            sportIds: [],
            imageUrls: [],
            amenityIds: [],
            tagIds: [],
            rating: 0,
            reviewCount: 0,
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
            name: 'Александр Иванов',
            slug: 'alexander-ivanov',
            bio: '',
            avatarUrl: '',
            experienceYears: 5,
            specialtyIds: [],
            workFormatIds: [1],
            rating: 0,
            reviewCount: 0,
            priceFrom: 0,
            sportIds: [],
            managedByUserId: MVP_PROVIDER_USER_ID,
          },
        ]}
        bookings={[]}
        reviews={[]}
      />,
    );

    expect(screen.getByTestId('provider-summary-publications')).toHaveTextContent('2');
  });

  it('синхронно обновляет KPI и блок входящих записей после create и hard-delete букинга', () => {
    loginAsProvider();

    const activeBooking = {
      id: 77,
      createdAt: '2026-03-19T14:30:00.000Z',
      scheduleId: 701,
      ownerType: 'club' as const,
      ownerId: 1,
      userId: 1,
      clubId: 1,
      sportId: 3,
      date: '2099-04-18',
      status: 'confirmed' as const,
      paymentStatus: 'paid' as const,
      totalPrice: 1300,
    };

    const athleteUser = {
      id: 1,
      createdAt: '2026-03-17T09:00:00.000Z',
      role: 'athlete' as const,
      name: 'Алексей Миронов',
      email: 'alexey@sporthub.local',
      phone: '+7 999 123-45-67',
      password: 'secret',
      favoriteClubIds: [],
    };

    const bookingSchedule = {
      id: 701,
      createdAt: '2026-03-19T14:00:00.000Z',
      ownerType: 'club' as const,
      ownerId: 1,
      clubId: 1,
      sportId: 3,
      title: 'Вечерняя группа',
      date: '2099-04-18',
      startTime: '19:00',
      endTime: '20:00',
      durationMinutes: 60,
      level: 'all_levels' as const,
      capacity: 12,
      bookedCount: 1,
      price: 1300,
      room: 'Зал №2',
    };

    const { rerender } = render(
      <ProviderProfilePage
        bookings={[]}
        clubs={[providerClub]}
        reviews={[]}
        schedule={[bookingSchedule]}
        trainers={[]}
        users={[athleteUser]}
      />,
    );

    expect(screen.getByTestId('provider-summary-bookings')).toHaveTextContent('0');
    expect(screen.getByText('Нет входящих записей')).toBeInTheDocument();

    rerender(
      <ProviderProfilePage
        bookings={[activeBooking]}
        clubs={[providerClub]}
        reviews={[]}
        schedule={[bookingSchedule]}
        trainers={[]}
        users={[athleteUser]}
      />,
    );

    expect(screen.getByTestId('provider-summary-bookings')).toHaveTextContent('1');
    expect(screen.getByText('Алексей Миронов')).toBeInTheDocument();
    expect(screen.getByText('Вечерняя группа')).toBeInTheDocument();

    rerender(
      <ProviderProfilePage
        bookings={[]}
        clubs={[providerClub]}
        reviews={[]}
        schedule={[bookingSchedule]}
        trainers={[]}
        users={[athleteUser]}
      />,
    );

    expect(screen.getByTestId('provider-summary-bookings')).toHaveTextContent('0');
    expect(screen.getByText('Нет входящих записей')).toBeInTheDocument();
  });
});
