// Тесты публичной страницы клуба.
//
// Бэкенд не поднимается: страница ходит настоящим клиентом, а стенд отвечает
// заготовленными телами (`helpers/api-stub`). Поэтому здесь же проверяется и то,
// что за записями страница не ходит вовсе: публичной странице они не нужны,
// а тянуть записи всей площадки ради карточки она однажды уже пробовала.
//
// ⚠️ Фаза 38, шаг 38.25: случай «бейдж надёжности из поля карточки» снят —
// предмета нет (реестр `phase-38-reliability-cut.md`, Т10).
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ClubDetailPage from '@/app/clubs/[slug]/page';
import { installApiStub, type ApiStub } from '@/test/helpers/api-stub';
import { createFixtureRoutes } from '@/test/helpers/fixture-routes';
import { fixtureClub, fixtureClubOffering, fixtureClubSlot1 } from '@sporthub/fixtures';

/** Адрес карточки по ссылке — собирается так же, как его собирает клиент. */
const bySlug = (slug: string) => `/clubs/by-slug/${encodeURIComponent(slug)}`;

describe('Club detail page', () => {
  let stub: ApiStub;

  beforeEach(() => {
    /* Phase 28.22: anchor расписания на 2026-03-18 — слоты фикстур
     * (date='2026-03-18' / '2026-03-20') попадают в текущую ISO-неделю. */
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-18T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    stub?.restore();
  });

  it('рендерит публичную страницу клуба с ключевыми секциями', async () => {
    stub = installApiStub({
      ...createFixtureRoutes(),
      [bySlug('volna-aquatic-club')]: { club: fixtureClub },
    });

    render(await ClubDetailPage({ params: Promise.resolve({ slug: 'volna-aquatic-club' }) }));

    expect(screen.getByRole('heading', { name: 'Volna Aquatic Club' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Направления клуба' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Тренеры клуба' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Расписание на неделю' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Отзывы клуба' })).toBeInTheDocument();
  });

  it('за записями не ходит вовсе', async () => {
    stub = installApiStub({
      ...createFixtureRoutes(),
      [bySlug('volna-aquatic-club')]: { club: fixtureClub },
    });

    await ClubDetailPage({ params: Promise.resolve({ slug: 'volna-aquatic-club' }) });

    // Раньше страница считала бейдж надёжности сама и забирала ради этого записи
    // клуба; бейджа больше нет, а правило «публичная страница записей не читает»
    // осталось.
    expect(stub.calls.filter((call) => call.startsWith('/bookings'))).toEqual([]);
  });

  it('отдаёт notFound для несуществующего клуба', async () => {
    stub = installApiStub({
      ...createFixtureRoutes(),
      // Пустое тело — код 404: страница обязана отличить его от недоступного бэкенда.
      [bySlug('missing-club')]: null,
    });

    await expect(
      ClubDetailPage({ params: Promise.resolve({ slug: 'missing-club' }) }),
    ).rejects.toMatchObject({
      digest: expect.stringContaining('404'),
    });
  });

  it('открывает клуб по кириллическому slug даже если route param приходит encoded', async () => {
    const cyrillicClub = {
      ...fixtureClub,
      id: 101,
      slug: 'клуб-мс',
      name: 'Клуб МС',
      city: 'Саратов',
      address: 'спортивная 145',
      description: 'Клуб с кириллическим slug и рабочей detail page.',
      shortDescription: 'Клуб с кириллическим slug.',
      imageUrls: [],
      amenities: [],
      tags: ['Интенсив'],
      rating: 0,
      reviewCount: 0,
      source: 'provider' as const,
      status: 'published' as const,
    };
    const cyrillicOffering = {
      ...fixtureClubOffering,
      id: 201,
      ownerId: cyrillicClub.id,
      title: 'Стартовая группа',
      description: cyrillicClub.description,
      address: cyrillicClub.address,
      price: 1200,
    };
    const cyrillicSchedule = {
      ...fixtureClubSlot1,
      id: 301,
      offeringId: cyrillicOffering.id,
      ownerId: cyrillicClub.id,
      clubId: cyrillicClub.id,
      trainerId: undefined,
      title: 'Стартовая группа',
      /* Phase 30.7: 14:00 Samara — slot после этого времени, иначе isSlotUpcoming его отсечёт. */
      startTime: '17:30',
      endTime: '18:30',
      price: 1200,
      room: 'Зал A',
    };
    const encodedSlug = '%D0%BA%D0%BB%D1%83%D0%B1-%D0%BC%D1%81';

    stub = installApiStub({
      ...createFixtureRoutes(),
      // Раскодирование ссылки — работа бэкенда: он отвечает на закодированный адрес
      // той же карточкой. Здесь важно лишь, что страница до него доходит.
      [bySlug(encodedSlug)]: { club: cyrillicClub },
      '/trainers': [],
      '/offerings': [cyrillicOffering],
      '/schedule?ownerType=club&includeFull=true': [cyrillicSchedule],
      '/reviews': [],
      '/bookings': [],
      '/trainer-club-links': [],
    });

    render(await ClubDetailPage({ params: Promise.resolve({ slug: encodedSlug }) }));

    expect(screen.getByRole('heading', { name: 'Клуб МС' })).toBeInTheDocument();
    expect(screen.getByText('Стартовая группа')).toBeInTheDocument();
  });

  it('не ломается на минимальной provider-публикации без rich-content', async () => {
    const minimalClub = {
      ...fixtureClub,
      id: 101,
      slug: 'start-swim-club',
      name: 'Start Swim Club',
      description: 'Новый клуб с базовой публикацией и первым расписанием.',
      shortDescription: 'Первая публикация клуба без галереи и отзывов.',
      imageUrls: [],
      amenities: [],
      tags: [],
      rating: 0,
      reviewCount: 0,
      source: 'provider' as const,
      status: 'published' as const,
    };
    const minimalOffering = {
      ...fixtureClubOffering,
      id: 201,
      ownerId: minimalClub.id,
      title: 'Стартовая группа',
      description: minimalClub.description,
      price: 1200,
      address: minimalClub.address,
    };
    const minimalSchedule = {
      ...fixtureClubSlot1,
      id: 301,
      offeringId: minimalOffering.id,
      ownerId: minimalClub.id,
      clubId: minimalClub.id,
      trainerId: undefined,
      title: 'Стартовая группа',
      /* Phase 30.7: slot после 14:00 Samara чтобы isSlotUpcoming его пропустил. */
      startTime: '17:30',
      endTime: '18:30',
      price: 1200,
      room: 'Зал A',
    };

    stub = installApiStub({
      ...createFixtureRoutes(),
      [bySlug('start-swim-club')]: { club: minimalClub },
      '/trainers': [],
      '/offerings': [minimalOffering],
      '/schedule?ownerType=club&includeFull=true': [minimalSchedule],
      '/reviews': [],
      '/bookings': [],
      '/trainer-club-links': [],
    });

    render(await ClubDetailPage({ params: Promise.resolve({ slug: 'start-swim-club' }) }));

    expect(screen.getByRole('heading', { name: 'Start Swim Club' })).toBeInTheDocument();
    expect(screen.getByTestId('club-trainers-empty')).toBeInTheDocument();
    expect(screen.getByTestId('club-reviews-empty')).toBeInTheDocument();
    expect(screen.getByText('Стартовая группа')).toBeInTheDocument();
  });
});
