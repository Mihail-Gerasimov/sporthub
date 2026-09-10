// Публичные страницы не показывают скрытых соседей (шаг 36.18).
//
// Карточка клуба тянет тренеров ОТДЕЛЬНЫМ запросом, карточка тренера — клуб-площадку.
// Это шестой, самый незаметный путь правила видимости: сама публикация может быть
// опубликована, а рядом с ней на витрине оказывается скрытая.
//
// До этой фазы обе страницы звали читателей `getTrainers()` / `getClubById()`, а те
// слали `includeHidden=true` БЕЗУСЛОВНО — наследство прежней модели, когда флаг
// ничего не ограничивал. Публичной витрине скрытые не нужны вовсе.
//
// ⚠️ Тесты здесь — ПОДКЛЮЧЕНИЯ, а не вида: проверяется, какой адрес страница на самом
// деле дёргает. «Тест страницы» этого не гарантирует — фаза 35 наступила на это семь
// раз подряд: разделение было сделано на сервере, покрыто тестами и до браузера
// не дошло, потому что страница спрашивала не тот адрес.
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ClubDetailPage from '@/app/clubs/[slug]/page';
import TrainerDetailPage from '@/app/trainers/[slug]/page';
import { installApiStub, type ApiStub } from '@/test/helpers/api-stub';
import { createFixtureRoutes } from '@/test/helpers/fixture-routes';
import { fixtureClub, fixtureTrainer } from '@sporthub/fixtures';

const clubBySlug = (slug: string) => `/clubs/by-slug/${encodeURIComponent(slug)}`;
const trainerBySlug = (slug: string) => `/trainers/by-slug/${encodeURIComponent(slug)}`;

/** Клуб-площадка тренера 1 — по подтверждённой связи из общих фикстур. */
const venueRoute = `/clubs/${fixtureClub.id}`;

const hiddenClub = {
  ...fixtureClub,
  status: 'hidden' as const,
  hiddenKind: 'moderation' as const,
  hideReason: 'На фотографиях чужой зал',
};

const hiddenTrainer = {
  ...fixtureTrainer,
  status: 'hidden' as const,
  hiddenKind: 'moderation' as const,
  hideReason: 'Не подтверждена квалификация',
};

/** Адреса, в которых страница просит скрытые публикации. Публичной витрине их не нужно. */
const hiddenAsked = (stub: ApiStub) => stub.calls.filter((call) => call.includes('includeHidden'));

describe('Публичные страницы не показывают скрытых соседей', () => {
  let stub: ApiStub;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-18T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    stub?.restore();
  });

  describe('тренеры на странице клуба', () => {
    it('страница просит ОПУБЛИКОВАННЫХ тренеров и не шлёт флаг скрытых', async () => {
      stub = installApiStub({
        ...createFixtureRoutes(),
        [clubBySlug('volna-aquatic-club')]: { club: fixtureClub },
      });

      await ClubDetailPage({ params: Promise.resolve({ slug: 'volna-aquatic-club' }) });

      expect(stub.callTo('/trainers')).toBe('/trainers');
      expect(hiddenAsked(stub)).toEqual([]);
    });

    it('скрытый тренер клуба на его публичной странице не появляется', async () => {
      stub = installApiStub({
        ...createFixtureRoutes(),
        [clubBySlug('volna-aquatic-club')]: { club: fixtureClub },
        // Опубликованных тренеров нет...
        '/trainers': [],
        // ...а по прежнему адресу со скрытыми — есть, и связь с клубом подтверждена.
        // Спросит страница не тот адрес — тренер окажется на витрине.
        '/trainers?includeHidden=true': [hiddenTrainer],
      });

      render(await ClubDetailPage({ params: Promise.resolve({ slug: 'volna-aquatic-club' }) }));

      expect(screen.getByTestId('club-trainers-empty')).toBeInTheDocument();
      expect(screen.queryByText(fixtureTrainer.name)).not.toBeInTheDocument();
    });
  });

  describe('клуб-площадка на странице тренера', () => {
    it('страница просит площадку по номеру и не шлёт флаг скрытых', async () => {
      stub = installApiStub({
        ...createFixtureRoutes(),
        [trainerBySlug('marina-sokolova')]: { trainer: fixtureTrainer },
      });

      await TrainerDetailPage({ params: Promise.resolve({ slug: 'marina-sokolova' }) });

      // Одна строка вместо всего каталога: отбор делает запрос, а не память страницы.
      expect(stub.callTo(venueRoute)).toBe(venueRoute);
      expect(hiddenAsked(stub)).toEqual([]);
    });

    it('скрытый клуб-площадка на публичной карточке тренера не показывается', async () => {
      stub = installApiStub({
        ...createFixtureRoutes(),
        [trainerBySlug('marina-sokolova')]: { trainer: fixtureTrainer },
        // Владелец клуба и модератор получают тело даже на скрытую публикацию —
        // и на ЧУЖОЙ публичной странице она всё равно не место.
        [venueRoute]: { club: hiddenClub },
      });

      render(await TrainerDetailPage({ params: Promise.resolve({ slug: 'marina-sokolova' }) }));

      expect(screen.queryByTestId('trainer-affiliated-club-section')).not.toBeInTheDocument();
    });

    it('404 на клубе-площадке карточку тренера не роняет', async () => {
      stub = installApiStub({
        ...createFixtureRoutes(),
        [trainerBySlug('marina-sokolova')]: { trainer: fixtureTrainer },
        // Гостю скрытая площадка отвечает 404 — это обычный ответ, а не сбой.
        [venueRoute]: null,
      });

      render(await TrainerDetailPage({ params: Promise.resolve({ slug: 'marina-sokolova' }) }));

      expect(screen.getByRole('heading', { name: 'Марина Соколова' })).toBeInTheDocument();
      expect(screen.queryByTestId('trainer-affiliated-club-section')).not.toBeInTheDocument();
    });

    it('опубликованный клуб-площадка показывается по-прежнему', async () => {
      stub = installApiStub({
        ...createFixtureRoutes(),
        [trainerBySlug('marina-sokolova')]: { trainer: fixtureTrainer },
      });

      render(await TrainerDetailPage({ params: Promise.resolve({ slug: 'marina-sokolova' }) }));

      expect(screen.getByTestId('trainer-affiliated-club-section')).toBeInTheDocument();
    });
  });
});
