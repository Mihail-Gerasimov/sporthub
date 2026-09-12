// Phase 26 Step 26.4: тесты CRUD в ProviderPublications.
// После переноса state/handlers publish-модалок из корневого ProviderProfilePage
// компонент поддерживает edit (fetch /api/clubs/[id] или /api/trainers/[id] +
// открытие модалки) и delete (confirm + DELETE + toast). Существующий smoke-тест
// access-denied в provider-publications-reviews-settings.test.tsx остаётся.
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderInFaceCabinet, trainerFace } from '@/test/helpers/cabinet';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  distanceKm: 0,
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

  // ⚠️ Прежняя единая проверка «правка предлагается по ВСЕМ своим лицам — и по клубу,
  // и по карточке» разделена надвое, и это не косметика. Шаг 35.34 доказывал ею, что
  // право роли больше не отменяет второе владение: владелец клуба видит и свою карточку
  // тренера. Но с адресными кабинетами «оба лица в одном рендере» — это картина, которой
  // в бою нет: у клуба свой кабинет, у карточки свой, и раздел показывает лицо ОТКРЫТОГО
  // кабинета. Правило то же — «правку даёт владение, а не роль», — просто проверяется оно
  // теперь по кабинету на каждое лицо. Контроль «чужое не своё» ниже остаётся общим.
  it('в кабинете КЛУБА правка предлагается по клубу — и только по нему', () => {
    loginAsProvider();
    // Умолчание помощника (клуб 1) совпадает с номером `providerClub`.
    renderInFaceCabinet(
      <ProviderPublications clubs={[providerClub]} trainers={[providerTrainer]} />,
    );

    expect(screen.getAllByRole('button', { name: 'Редактировать' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Удалить' })).toHaveLength(1);
    expect(screen.getByText('Volna Aquatic Club')).toBeInTheDocument();
    // Карточка тренера того же человека сюда не попадает: у неё свой кабинет.
    expect(screen.queryByText('Марина Соколова')).not.toBeInTheDocument();
    // Плашки «Редактирование через корневой кабинет» быть не должно
    expect(screen.queryByText(/корневой кабинет/i)).not.toBeInTheDocument();
  });

  it('в кабинете КАРТОЧКИ ТРЕНЕРА правка предлагается по карточке — и только по ней', () => {
    // Вторая половина того же правила: владение карточкой даёт правку и тогда,
    // когда тот же человек владеет ещё и клубом.
    loginAsProvider();
    renderInFaceCabinet(
      <ProviderPublications clubs={[providerClub]} trainers={[providerTrainer]} />,
      trainerFace(providerTrainer.id, providerTrainer.name),
    );

    expect(screen.getAllByRole('button', { name: 'Редактировать' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Удалить' })).toHaveLength(1);
    expect(screen.getByText('Марина Соколова')).toBeInTheDocument();
    expect(screen.queryByText('Volna Aquatic Club')).not.toBeInTheDocument();
    expect(screen.queryByText(/корневой кабинет/i)).not.toBeInTheDocument();
  });

  it('чужие публикации в разделе не показываются', () => {
    // Контроль к проверке выше: показывается ВЛАДЕНИЕ, а не всё подряд.
    loginAsProvider();
    renderInFaceCabinet(
      <ProviderPublications
        clubs={[{ ...providerClub, id: 99, name: 'Чужой клуб', managedByUserId: 777 }]}
        trainers={[]}
      />,
    );

    expect(screen.queryByText('Чужой клуб')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Редактировать' })).not.toBeInTheDocument();
  });

  it('кнопок заведения лица в кабинете лица НЕТ — их место в личном кабинете', () => {
    // ⚠️ Шаг 36.32. Заведение лица — действие ЧЕЛОВЕКА, и место у него одно:
    // `/profile/me/dashboard`. Проверка нужна именно на отсутствие: без неё
    // «перенесли» и «продублировали» неотличимы, а два места заведения — это
    // две формы, которые разъедутся при первой же правке.
    //
    // Раздел кабинета лица остаётся разделом ПРАВКИ: «Редактировать» и «Удалить»
    // на месте, и это проверяют соседние тесты набора.
    loginAsProvider();
    renderInFaceCabinet(<ProviderPublications clubs={[]} trainers={[]} />);

    expect(screen.queryByRole('button', { name: 'Опубликовать клуб' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Опубликовать тренера' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Опубликовать карточку тренера' }),
    ).not.toBeInTheDocument();
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

    renderInFaceCabinet(<ProviderPublications clubs={[providerClub]} trainers={[]} />);

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

    renderInFaceCabinet(<ProviderPublications clubs={[providerClub]} trainers={[]} />);
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

    renderInFaceCabinet(<ProviderPublications clubs={[providerClub]} trainers={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));

    expect(fetchMock).not.toHaveBeenCalled();
    confirmMock.mockRestore();
  });

  it('DELETE с 403 → toast error, без refresh', async () => {
    const confirmMock = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fetchMock.mockResolvedValue(createJsonResponse({ success: false, error: 'Нет прав' }, 403));
    loginAsProvider();

    renderInFaceCabinet(<ProviderPublications clubs={[providerClub]} trainers={[]} />);
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

    renderInFaceCabinet(<ProviderPublications clubs={[providerClub]} trainers={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/Не найдено/i);
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
