// Плашка скрытой публикации на карточках клуба и тренера (шаг 36.17).
//
// До этой фазы страница отсекала скрытую публикацию по статусу, НЕ разбирая, кто
// смотрит: заглушку «Публикация скрыта» получал и владелец, и модератор, то есть
// ровно те двое, кому карточка и нужна. Теперь правило видимости живёт на бэкенде:
// гостю и постороннему приходит 404, владельцу и модератору — тело целиком.
//
// Отсюда обязанности страницы, и они проверяются здесь:
//   1. 404 отрабатывается уводом на `notFound()`, а не пустотой и не ошибкой;
//   2. пришло тело со статусом `hidden` — рисуется КАРТОЧКА ЦЕЛИКОМ плюс плашка;
//   3. текст плашки берётся из словаря по ПРИЗНАКУ вида скрытия (`hiddenKind`),
//      а не из текста причины.
//
// ⚠️ Третий пункт — главная ловушка шага (ловушка 6 плана): плашка «Скрыто
// модератором» на клубе, который владелец сам убрал в архив. Проверяется отдельным
// тестом на каждой из двух карточек: club и trainer — два независимых места,
// и расхождение между ними в этом проекте исторически самый частый дефект.
//
// ⚠️ Владения страница не считает и `managedByUserId` не спрашивает: тело пришло —
// значит смотрящий имеет право его видеть, это решил маршрут.
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ClubDetailPage from '@/app/clubs/[slug]/page';
import TrainerDetailPage from '@/app/trainers/[slug]/page';
import { installApiStub, type ApiStub } from '@/test/helpers/api-stub';
import { createFixtureRoutes } from '@/test/helpers/fixture-routes';
import { HIDE_KIND_NOTICE } from '@sporthub/domain';
import { fixtureClub, fixtureTrainer } from '@sporthub/fixtures';

const clubBySlug = (slug: string) => `/clubs/by-slug/${encodeURIComponent(slug)}`;
const trainerBySlug = (slug: string) => `/trainers/by-slug/${encodeURIComponent(slug)}`;

/** Причина архива — служебная. Владелец сам убрал публикацию, показывать её незачем. */
const ARCHIVE_REASON = 'Служебная отметка архива';
/** Причина модерации — главное содержимое плашки: без неё непонятно, что чинить. */
const MODERATION_REASON = 'На фотографиях чужой зал';

/** Клуб, убранный в архив САМИМ владельцем. */
const archivedClub = {
  ...fixtureClub,
  status: 'hidden' as const,
  hiddenKind: 'owner_archive' as const,
  hideReason: ARCHIVE_REASON,
};

/** Клуб, скрытый модератором. Те же четыре поля, другой признак. */
const moderatedClub = {
  ...fixtureClub,
  status: 'hidden' as const,
  hiddenKind: 'moderation' as const,
  hideReason: MODERATION_REASON,
};

const archivedTrainer = {
  ...fixtureTrainer,
  status: 'hidden' as const,
  hiddenKind: 'owner_archive' as const,
  hideReason: ARCHIVE_REASON,
};

const moderatedTrainer = {
  ...fixtureTrainer,
  status: 'hidden' as const,
  hiddenKind: 'moderation' as const,
  hideReason: MODERATION_REASON,
};

describe('Плашка скрытой публикации', () => {
  let stub: ApiStub;

  beforeEach(() => {
    /* Тот же анчор, что и в остальных тестах карточек: слоты фикстур попадают
     * в текущую ISO-неделю, и расписание рисуется. */
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-18T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    stub?.restore();
  });

  describe('карточка клуба', () => {
    it('гостю карточки нет вовсе: 404 маршрута страница отрабатывает notFound()', async () => {
      stub = installApiStub({
        ...createFixtureRoutes(),
        // Скрытая публикация отвечает гостю 404 — тем же кодом, что и несуществующая.
        [clubBySlug('volna-aquatic-club')]: null,
      });

      await expect(
        ClubDetailPage({ params: Promise.resolve({ slug: 'volna-aquatic-club' }) }),
      ).rejects.toMatchObject({ digest: expect.stringContaining('404') });
    });

    it('владельцу отдаётся карточка целиком, а не заглушка вместо неё', async () => {
      stub = installApiStub({
        ...createFixtureRoutes(),
        [clubBySlug('volna-aquatic-club')]: { club: archivedClub },
      });

      render(await ClubDetailPage({ params: Promise.resolve({ slug: 'volna-aquatic-club' }) }));

      expect(screen.getByRole('heading', { name: 'Volna Aquatic Club' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Расписание на неделю' })).toBeInTheDocument();
      expect(screen.getByTestId('hidden-publication-notice')).toBeInTheDocument();
    });

    it('самоархивированный клуб НЕ говорит «скрыто модератором» и не показывает причину', async () => {
      stub = installApiStub({
        ...createFixtureRoutes(),
        [clubBySlug('volna-aquatic-club')]: { club: archivedClub },
      });

      render(await ClubDetailPage({ params: Promise.resolve({ slug: 'volna-aquatic-club' }) }));

      const notice = screen.getByTestId('hidden-publication-notice');

      expect(notice).toHaveTextContent(HIDE_KIND_NOTICE.owner_archive);
      expect(notice).not.toHaveTextContent(HIDE_KIND_NOTICE.moderation);
      // Причина архива служебная: владелец и так знает, что убрал публикацию сам.
      expect(notice).not.toHaveTextContent(ARCHIVE_REASON);
    });

    it('скрытый модератором клуб несёт текст модерации и саму причину', async () => {
      stub = installApiStub({
        ...createFixtureRoutes(),
        [clubBySlug('volna-aquatic-club')]: { club: moderatedClub },
      });

      render(await ClubDetailPage({ params: Promise.resolve({ slug: 'volna-aquatic-club' }) }));

      const notice = screen.getByTestId('hidden-publication-notice');

      expect(notice).toHaveTextContent(HIDE_KIND_NOTICE.moderation);
      expect(notice).not.toHaveTextContent(HIDE_KIND_NOTICE.owner_archive);
      expect(notice).toHaveTextContent(MODERATION_REASON);
    });

    it('на опубликованном клубе плашки нет', async () => {
      stub = installApiStub({
        ...createFixtureRoutes(),
        [clubBySlug('volna-aquatic-club')]: { club: fixtureClub },
      });

      render(await ClubDetailPage({ params: Promise.resolve({ slug: 'volna-aquatic-club' }) }));

      expect(screen.queryByTestId('hidden-publication-notice')).not.toBeInTheDocument();
    });
  });

  describe('карточка тренера', () => {
    it('гостю карточки нет вовсе: 404 маршрута страница отрабатывает notFound()', async () => {
      stub = installApiStub({
        ...createFixtureRoutes(),
        [trainerBySlug('marina-sokolova')]: null,
      });

      await expect(
        TrainerDetailPage({ params: Promise.resolve({ slug: 'marina-sokolova' }) }),
      ).rejects.toMatchObject({ digest: expect.stringContaining('404') });
    });

    it('владельцу отдаётся карточка целиком, а не заглушка вместо неё', async () => {
      stub = installApiStub({
        ...createFixtureRoutes(),
        [trainerBySlug('marina-sokolova')]: { trainer: archivedTrainer },
      });

      render(await TrainerDetailPage({ params: Promise.resolve({ slug: 'marina-sokolova' }) }));

      expect(screen.getByRole('heading', { name: 'Марина Соколова' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Расписание' })).toBeInTheDocument();
      expect(screen.getByTestId('hidden-publication-notice')).toBeInTheDocument();
    });

    it('самоархивированный тренер НЕ говорит «скрыто модератором» и не показывает причину', async () => {
      stub = installApiStub({
        ...createFixtureRoutes(),
        [trainerBySlug('marina-sokolova')]: { trainer: archivedTrainer },
      });

      render(await TrainerDetailPage({ params: Promise.resolve({ slug: 'marina-sokolova' }) }));

      const notice = screen.getByTestId('hidden-publication-notice');

      expect(notice).toHaveTextContent(HIDE_KIND_NOTICE.owner_archive);
      expect(notice).not.toHaveTextContent(HIDE_KIND_NOTICE.moderation);
      expect(notice).not.toHaveTextContent(ARCHIVE_REASON);
    });

    it('скрытый модератором тренер несёт текст модерации и саму причину', async () => {
      stub = installApiStub({
        ...createFixtureRoutes(),
        [trainerBySlug('marina-sokolova')]: { trainer: moderatedTrainer },
      });

      render(await TrainerDetailPage({ params: Promise.resolve({ slug: 'marina-sokolova' }) }));

      const notice = screen.getByTestId('hidden-publication-notice');

      expect(notice).toHaveTextContent(HIDE_KIND_NOTICE.moderation);
      expect(notice).not.toHaveTextContent(HIDE_KIND_NOTICE.owner_archive);
      expect(notice).toHaveTextContent(MODERATION_REASON);
    });

    it('на опубликованном тренере плашки нет', async () => {
      stub = installApiStub({
        ...createFixtureRoutes(),
        [trainerBySlug('marina-sokolova')]: { trainer: fixtureTrainer },
      });

      render(await TrainerDetailPage({ params: Promise.resolve({ slug: 'marina-sokolova' }) }));

      expect(screen.queryByTestId('hidden-publication-notice')).not.toBeInTheDocument();
    });
  });
});
