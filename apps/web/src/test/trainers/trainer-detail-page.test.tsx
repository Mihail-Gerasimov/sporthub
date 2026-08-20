// Тесты публичной страницы тренера.
//
// Данные приходят настоящим клиентом с заготовленного стенда ответов
// (`helpers/api-stub`): подменяется транспорт, а не модуль доступа к данным.
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TrainerDetailPage from '@/app/trainers/[slug]/page';
import { installApiStub, type ApiStub } from '@/test/helpers/api-stub';
import { createFixtureRoutes } from '@/test/helpers/fixture-routes';
import { fixtureTrainer, fixtureTrainerOffering, fixtureTrainerSlot } from '@sporthub/fixtures';

const bySlug = (slug: string) => `/trainers/by-slug/${encodeURIComponent(slug)}`;

describe('Trainer detail page', () => {
  let stub: ApiStub;

  beforeEach(() => {
    /* Phase 28.23: anchor расписания на 2026-03-18 — слоты фикстур
     * (date='2026-03-18') попадают в текущую ISO-неделю. */
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-18T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    stub?.restore();
  });

  it('рендерит публичную страницу тренера с ключевыми секциями', async () => {
    stub = installApiStub({
      ...createFixtureRoutes(),
      [bySlug('marina-sokolova')]: { trainer: fixtureTrainer },
    });

    render(await TrainerDetailPage({ params: Promise.resolve({ slug: 'marina-sokolova' }) }));

    /* Имя тренера из данных */
    expect(screen.getByRole('heading', { name: 'Марина Соколова' })).toBeInTheDocument();
    /* Ключевые секции страницы */
    expect(screen.getByRole('heading', { name: 'Услуги тренера' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Расписание' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Отзывы' })).toBeInTheDocument();
  });

  it('записи спрашивает только по своему тренеру и только нужными статусами', async () => {
    stub = installApiStub({
      ...createFixtureRoutes(),
      [bySlug('marina-sokolova')]: { trainer: fixtureTrainer },
    });

    await TrainerDetailPage({ params: Promise.resolve({ slug: 'marina-sokolova' }) });

    const call = stub.callTo('/bookings');
    expect(call).toBeDefined();
    expect(call).toContain(`trainerId=${fixtureTrainer.id}`);
    expect(call).toContain(
      'status=completed%2Cno_show%2Ccancelled_by_provider%2Crejected_by_provider',
    );
  });

  it('отдаёт notFound для несуществующего тренера', async () => {
    stub = installApiStub({
      ...createFixtureRoutes(),
      [bySlug('missing-trainer')]: null,
    });

    await expect(
      TrainerDetailPage({ params: Promise.resolve({ slug: 'missing-trainer' }) }),
    ).rejects.toMatchObject({
      digest: expect.stringContaining('404'),
    });
  });

  it('отдаёт notFound для пустого slug', async () => {
    // Пустая ссылка отсекается ДО запроса — стенд ответов здесь даже не нужен.
    stub = installApiStub({});

    await expect(
      TrainerDetailPage({ params: Promise.resolve({ slug: '' }) }),
    ).rejects.toMatchObject({
      digest: expect.stringContaining('404'),
    });
    expect(stub.calls).toEqual([]);
  });

  it('не ломается на минимальной provider-публикации тренера без связанного клуба и отзывов', async () => {
    const minimalTrainer = {
      ...fixtureTrainer,
      id: 101,
      slug: 'ivan-belov',
      name: 'Иван Белов',
      bio: 'Новый тренер с первой опубликованной услугой.',
      avatarUrl: '',
      reviewCount: 0,
      rating: 0,
      source: 'provider' as const,
      status: 'published' as const,
    };
    const minimalOffering = {
      ...fixtureTrainerOffering,
      id: 201,
      ownerId: minimalTrainer.id,
      title: 'Персональная тренировка: Плавание',
      description: 'Первая персональная услуга без привязки к клубу.',
      address: minimalTrainer.address ?? 'ул. Лесная, 23к1',
    };
    const minimalSchedule = {
      ...fixtureTrainerSlot,
      id: 301,
      offeringId: minimalOffering.id,
      ownerId: minimalTrainer.id,
      trainerId: minimalTrainer.id,
      title: 'Персональная тренировка: Плавание',
      /* Phase 28.23: дата = текущий день анчора (2026-03-18), чтобы slot
       * попадал на активный таб DetailScheduleWeek и chip room рендерился. */
      date: '2026-03-18',
      /* Phase 30.7: системное время теста = 14:00 Samara → slot должен быть после, иначе isSlotUpcoming его отсечёт. */
      startTime: '17:30',
      endTime: '18:30',
      room: 'Индивидуальный зал',
    };

    stub = installApiStub({
      ...createFixtureRoutes(),
      [bySlug('ivan-belov')]: { trainer: minimalTrainer },
      '/clubs?includeHidden=true': [],
      '/offerings': [minimalOffering],
      '/schedule?ownerType=all&includeFull=true': [minimalSchedule],
      '/reviews': [],
      '/bookings': [],
      // Подтверждённых связей нет — секция связанного клуба не должна появиться.
      '/trainer-club-links': [],
    });

    render(await TrainerDetailPage({ params: Promise.resolve({ slug: 'ivan-belov' }) }));

    expect(screen.getByRole('heading', { name: 'Иван Белов' })).toBeInTheDocument();
    expect(screen.queryByTestId('trainer-affiliated-club-section')).not.toBeInTheDocument();
    expect(screen.getByTestId('trainer-reviews-empty')).toBeInTheDocument();
    expect(screen.getAllByText('Персональная тренировка: Плавание').length).toBeGreaterThan(0);
    expect(screen.getByText('Индивидуальный зал')).toBeInTheDocument();
  });
});
