// ⚠️ Фаза 35, шаг 35.34. Проверка «чужому — плашка «Доступ ограничен»» снята
// не потому, что стала не нужна, а потому, что она никогда не была защитой:
// плашка рисовалась ПОВЕРХ уже отданных данных. Настоящая проверка стоит
// в серверном лейауте, ДО похода за данными, и проверяется она набором
// `src/test/security/protected-layouts.test.ts` — там же, где проверяется
// и то, что уведённому данные не запрашивались вообще.
// Тесты ProviderLinks (Step 25.12): две стороны связи тренер↔клуб.
// Club-side: приём/отказ/revoke pending + invite тренера через search.
// Trainer-side: мои pending/confirmed/history + revoke own + request-link modal.
// RevokeLinkWarningModal показывает число offerings, которые станут частными.
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { clubFace, renderInFaceCabinet, trainerFace } from '@/test/helpers/cabinet';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: refreshMock,
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

import { ProviderLinks } from '@/components/profile/provider/ProviderLinks';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import { facesOf } from '@/test/helpers/service-faces';
import type { Club, Offering, Trainer, TrainerClubLink, User } from '@sporthub/types';

process.env.TZ = 'UTC';

const providerUser: User = {
  id: 10,
  createdAt: '2026-01-01T00:00:00.000Z',
  name: 'Ирина Провайдер',
  email: 'provider@studio.local',
  phone: '+7 999 222-33-44',
  passwordHash: 'secret',
  favoriteClubIds: [],
};

const myClub: Club = {
  id: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  name: 'Aqua Pro',
  slug: 'aqua-pro',
  description: '',
  shortDescription: '',
  sportIds: [3],
  rating: 4.8,
  reviewCount: 0,
  city: 'Самара',
  address: '',
  phone: '',
  coordinates: { lat: 0, lng: 0 },
  imageUrls: [],
  tagIds: [],
  amenityIds: [],
  priceFrom: 1000,
  distanceKm: 0,
  managedByUserId: providerUser.id,
};

const foreignClub: Club = {
  ...myClub,
  id: 20,
  name: 'Чужой клуб',
  managedByUserId: 999,
};

const myTrainer: Trainer = {
  id: 5,
  createdAt: '2026-01-01T00:00:00.000Z',
  name: 'Мой Тренер',
  slug: 'my',
  bio: '',
  avatarUrl: '',
  experienceYears: 5,
  specialtyIds: [],
  workFormatIds: [],
  rating: 0,
  reviewCount: 0,
  priceFrom: 1500,
  sportIds: [1],
  managedByUserId: providerUser.id,
};

const foreignTrainer: Trainer = {
  ...myTrainer,
  id: 50,
  name: 'Чужой Тренер',
  managedByUserId: 888,
};

const anotherForeignTrainer: Trainer = {
  ...myTrainer,
  id: 51,
  name: 'Светлана Йога',
  managedByUserId: 777,
};

function authenticateProvider() {
  useAuthStore.setState({
    ...AUTH_STORE_DEFAULT_STATE,
    user: providerUser,
    accountKind: 'person',
    isAuthenticated: true,
    // ⚠️ Шаг 35.20a. Лица приезжают ответом «кто я»; чужие публикации в список
    // не попадают — их отбрасывает тот же отбор по владельцу, что и на сервере.
    faces: facesOf({
      userId: providerUser.id,
      clubs: [myClub, foreignClub],
      trainers: [myTrainer, foreignTrainer, anotherForeignTrainer],
    }),
  });
}

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('ProviderLinks (Step 25.12)', () => {
  beforeEach(() => {
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
    refreshMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('club-side: показывает pending-запросы от тренеров к моим клубам', () => {
    authenticateProvider();

    const pendingLink: TrainerClubLink = {
      id: 301,
      createdAt: '2026-04-20T10:00:00.000Z',
      trainerId: foreignTrainer.id,
      clubId: myClub.id,
      status: 'pending',
      initiatedBy: 'trainer',
    };

    renderInFaceCabinet(
      <ProviderLinks
        clubs={[myClub, foreignClub]}
        trainers={[myTrainer, foreignTrainer]}
        links={[pendingLink]}
        offerings={[]}
      />,
    );

    expect(screen.getByTestId('provider-links-club-side')).toBeInTheDocument();
    expect(screen.getByTestId(`provider-links-card-${pendingLink.id}`)).toBeInTheDocument();
  });

  it('club-side approve: клик «Подтвердить» шлёт POST /approve без личности', async () => {
    authenticateProvider();
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: { id: 301 } }));

    const pendingLink: TrainerClubLink = {
      id: 301,
      createdAt: '2026-04-20T10:00:00.000Z',
      trainerId: foreignTrainer.id,
      clubId: myClub.id,
      status: 'pending',
      initiatedBy: 'trainer',
    };

    renderInFaceCabinet(
      <ProviderLinks
        clubs={[myClub]}
        trainers={[foreignTrainer]}
        links={[pendingLink]}
        offerings={[]}
      />,
    );

    fireEvent.click(screen.getByTestId('provider-links-approve-301'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const call = fetchMock.mock.calls[0];
    expect(call[0]).toBe('/api/trainer-club-links/301/approve');
    // ⚠️ Тела нет вовсе. Сторону, принимающую решение, сервер определяет
    // по сессии: правило «решает противоположная инициатору сторона» было верным
    // и раньше — ему не хватало честного источника личности.
    expect(call[1]).toEqual({ method: 'POST' });
  });

  it('club-side reject: клик «Отклонить» шлёт POST /reject', async () => {
    authenticateProvider();
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));

    const pendingLink: TrainerClubLink = {
      id: 302,
      createdAt: '2026-04-20T10:00:00.000Z',
      trainerId: foreignTrainer.id,
      clubId: myClub.id,
      status: 'pending',
      initiatedBy: 'trainer',
    };

    renderInFaceCabinet(
      <ProviderLinks
        clubs={[myClub]}
        trainers={[foreignTrainer]}
        links={[pendingLink]}
        offerings={[]}
      />,
    );

    fireEvent.click(screen.getByTestId('provider-links-reject-302'));

    await waitFor(() => {
      expect(fetchMock.mock.calls[0][0]).toBe('/api/trainer-club-links/302/reject');
    });
  });

  it('club-side revoke: открывает warning modal с числом offerings и после confirm шлёт POST /revoke', async () => {
    authenticateProvider();
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));

    const confirmedLink: TrainerClubLink = {
      id: 303,
      createdAt: '2026-04-01T10:00:00.000Z',
      trainerId: foreignTrainer.id,
      clubId: myClub.id,
      status: 'confirmed',
      initiatedBy: 'trainer',
    };

    const attachedOffering: Offering = {
      id: 401,
      createdAt: '2026-04-01T10:00:00.000Z',
      ownerType: 'trainer',
      ownerId: foreignTrainer.id,
      trainerClubLinkId: confirmedLink.id,
      sportId: 1,
      title: 'Персональная йога',
      description: '',
      format: 'personal',
      price: 1500,
      durationMinutes: 60,
      capacity: 1,
      address: '',
      coordinates: { lat: 0, lng: 0 },
    };

    renderInFaceCabinet(
      <ProviderLinks
        clubs={[myClub]}
        trainers={[foreignTrainer]}
        links={[confirmedLink]}
        offerings={[attachedOffering]}
      />,
    );

    // Переключаемся на таб Подтверждённые.
    fireEvent.click(screen.getByTestId('provider-links-club-tab-confirmed'));
    fireEvent.click(screen.getByTestId('provider-links-revoke-303'));

    const modal = screen.getByTestId('provider-links-revoke-warning-modal');
    expect(modal).toBeInTheDocument();
    // Показывает число offerings (1 привязанный).
    expect(modal.textContent).toMatch(/1/);

    fireEvent.click(screen.getByTestId('provider-links-revoke-warning-confirm'));

    await waitFor(() => {
      expect(fetchMock.mock.calls[0][0]).toBe('/api/trainer-club-links/303/revoke');
    });
  });

  it('club-side invite: выбор тренера + клуба в модалке шлёт POST с initiatedBy=club', async () => {
    authenticateProvider();
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: { id: 999 } }, 201));

    renderInFaceCabinet(
      <ProviderLinks
        clubs={[myClub]}
        trainers={[foreignTrainer, anotherForeignTrainer]}
        links={[]}
        offerings={[]}
      />,
    );

    fireEvent.click(screen.getByTestId('provider-links-invite-button'));

    const modal = screen.getByTestId('provider-links-invite-modal');
    expect(modal).toBeInTheDocument();

    // Фильтр по поиску — находим anotherForeignTrainer (Светлана) по подстроке.
    const search = screen.getByTestId('provider-links-invite-search') as HTMLInputElement;
    fireEvent.change(search, { target: { value: 'Светлана' } });

    fireEvent.click(
      screen.getByTestId(`provider-links-invite-trainer-option-${anotherForeignTrainer.id}`),
    );
    // Клуб всего один, уже выбран автоматически — submit.
    fireEvent.click(screen.getByTestId('provider-links-invite-submit'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const call = fetchMock.mock.calls[0];
    expect(call[0]).toBe('/api/trainer-club-links');
    const body = JSON.parse(call[1].body as string);
    expect(body).toEqual({
      trainerId: anotherForeignTrainer.id,
      clubId: myClub.id,
      // Phase 27 Step 27.9: клиент явно передаёт initiatedBy='club' из invite-модалки,
      // чтобы сервер смог направить уведомление trainer-manager'у (а не самому себе).
      initiatedBy: 'club',
    });
  });

  // ⚠️ Три проверки ниже живут в кабинете КАРТОЧКИ ТРЕНЕРА (лицо `myTrainer`, номер 5).
  // Секция «Связи моих тренеров» показывается только тогда, когда у открытого кабинета
  // есть лицо-тренер; в кабинете клуба её нет и быть не должно — это разные кабинеты,
  // а не два блока одного.
  it('trainer-side: показывает pending-запросы моих тренеров к чужим клубам', () => {
    authenticateProvider();

    const myTrainerPending: TrainerClubLink = {
      id: 401,
      createdAt: '2026-04-20T10:00:00.000Z',
      trainerId: myTrainer.id,
      clubId: foreignClub.id,
      status: 'pending',
      initiatedBy: 'trainer',
    };

    renderInFaceCabinet(
      <ProviderLinks
        clubs={[myClub, foreignClub]}
        trainers={[myTrainer, foreignTrainer]}
        links={[myTrainerPending]}
        offerings={[]}
      />,
      trainerFace(myTrainer.id, myTrainer.name),
    );

    expect(screen.getByTestId('provider-links-trainer-side')).toBeInTheDocument();
    expect(screen.getByTestId(`provider-links-card-${myTrainerPending.id}`)).toBeInTheDocument();
  });

  it('trainer-side cancel own pending: POST /revoke для своего pending-запроса', async () => {
    authenticateProvider();
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));

    const myTrainerPending: TrainerClubLink = {
      id: 402,
      createdAt: '2026-04-20T10:00:00.000Z',
      trainerId: myTrainer.id,
      clubId: foreignClub.id,
      status: 'pending',
      initiatedBy: 'trainer',
    };

    renderInFaceCabinet(
      <ProviderLinks
        clubs={[myClub, foreignClub]}
        trainers={[myTrainer]}
        links={[myTrainerPending]}
        offerings={[]}
      />,
      trainerFace(myTrainer.id, myTrainer.name),
    );

    fireEvent.click(screen.getByTestId('provider-links-cancel-own-402'));

    await waitFor(() => {
      expect(fetchMock.mock.calls[0][0]).toBe('/api/trainer-club-links/402/revoke');
    });
  });

  it('trainer-side request-link: выбор клуба + моего тренера шлёт POST /api/trainer-club-links', async () => {
    authenticateProvider();
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: { id: 7 } }, 201));

    renderInFaceCabinet(
      <ProviderLinks
        clubs={[myClub, foreignClub]}
        trainers={[myTrainer]}
        links={[]}
        offerings={[]}
      />,
      trainerFace(myTrainer.id, myTrainer.name),
    );

    fireEvent.click(screen.getByTestId('provider-links-request-button'));

    const modal = screen.getByTestId('provider-links-request-modal');
    expect(modal).toBeInTheDocument();

    fireEvent.click(screen.getByTestId(`provider-links-request-club-option-${foreignClub.id}`));
    // Тренер один — выбран автоматически.
    fireEvent.click(screen.getByTestId('provider-links-request-submit'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const call = fetchMock.mock.calls[0];
    expect(call[0]).toBe('/api/trainer-club-links');
    expect(JSON.parse(call[1].body as string)).toEqual({
      trainerId: myTrainer.id,
      clubId: foreignClub.id,
      // Phase 27 Step 27.9: request-модалка всегда передаёт initiatedBy='trainer'
      // (симметрично с invite-модалкой, которая шлёт 'club').
      initiatedBy: 'trainer',
    });
  });

  it('revoke-warning отображает корректное число offerings для linkId', () => {
    authenticateProvider();

    const confirmedLink: TrainerClubLink = {
      id: 500,
      createdAt: '',
      trainerId: foreignTrainer.id,
      clubId: myClub.id,
      status: 'confirmed',
      initiatedBy: 'trainer',
    };

    const attachedOfferings: Offering[] = Array.from({ length: 3 }, (_, index) => ({
      id: 600 + index,
      createdAt: '',
      ownerType: 'trainer',
      ownerId: foreignTrainer.id,
      trainerClubLinkId: confirmedLink.id,
      sportId: 1,
      title: `Услуга ${index}`,
      description: '',
      format: 'personal',
      price: 1000,
      durationMinutes: 60,
      capacity: 1,
      address: '',
      coordinates: { lat: 0, lng: 0 },
    }));

    renderInFaceCabinet(
      <ProviderLinks
        clubs={[myClub]}
        trainers={[foreignTrainer]}
        links={[confirmedLink]}
        offerings={attachedOfferings}
      />,
    );

    fireEvent.click(screen.getByTestId('provider-links-club-tab-confirmed'));
    fireEvent.click(screen.getByTestId('provider-links-revoke-500'));

    const modal = screen.getByTestId('provider-links-revoke-warning-modal');
    expect(modal.textContent).toMatch(/3/);
  });
});

describe('Своё лицо не выдаётся за чужое', () => {
  // ⚠️ Найдено при переводе разделов на адресный кабинет и было настоящим регрессом.
  //
  // «Чьи связи показывать» — вопрос ОТКРЫТОГО КАБИНЕТА. «Что считать своим» —
  // вопрос ЧЕЛОВЕКА: собственная карточка тренера остаётся своей и тогда, когда
  // открыт кабинет клуба. Смешав их, кандидаты стали отбираться по лицам кабинета —
  // а там лицо ровно одно и одного вида, поэтому множество лиц ДРУГОГО вида пусто.
  //
  // Итог был замкнутым кругом: из кабинета карточки шлём запрос собственному клубу
  // как «чужому», из кабинета клуба его же подтверждаем. Ровно та накрутка
  // «сам себе», которую фаза закрывает в записях и отзывах.
  //
  // Связь своего со своим разрешена решением 22 и встаёт сразу подтверждённой —
  // но заводится ЯВНО, а не под видом связи с посторонним.
  beforeEach(() => {
    authenticateProvider();
  });

  it('в кабинете КАРТОЧКИ тренера собственный клуб не предлагается как чужой', async () => {
    renderInFaceCabinet(
      <ProviderLinks
        clubs={[myClub, foreignClub]}
        trainers={[myTrainer, foreignTrainer]}
        links={[]}
        offerings={[]}
      />,
      trainerFace(myTrainer.id, myTrainer.name),
    );

    fireEvent.click(screen.getByTestId('provider-links-request-button'));

    const options = await screen.findAllByTestId(/provider-links-request-club-option-/);
    const names = options.map((node) => node.textContent ?? '');

    expect(
      names.some((name) => name.includes(myClub.name)),
      'собственный клуб оказался в списке чужих, к которым можно запроситься',
    ).toBe(false);
    expect(
      names.some((name) => name.includes(foreignClub.name)),
      'настоящий чужой клуб пропал из списка — отбор стал слишком строгим',
    ).toBe(true);
  });

  it('в кабинете КЛУБА собственная карточка не предлагается как внешняя', async () => {
    renderInFaceCabinet(
      <ProviderLinks
        clubs={[myClub, foreignClub]}
        trainers={[myTrainer, foreignTrainer]}
        links={[]}
        offerings={[]}
      />,
      clubFace(myClub.id, myClub.name),
    );

    fireEvent.click(screen.getByTestId('provider-links-invite-button'));

    const options = await screen.findAllByTestId(/provider-links-invite-trainer-option-/);
    const names = options.map((node) => node.textContent ?? '');

    expect(
      names.some((name) => name.includes(myTrainer.name)),
      'собственная карточка тренера оказалась в списке внешних',
    ).toBe(false);
    expect(
      names.some((name) => name.includes(foreignTrainer.name)),
      'настоящий чужой тренер пропал из списка — отбор стал слишком строгим',
    ).toBe(true);
  });
});
