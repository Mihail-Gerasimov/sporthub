// Phase 28: главная страница SportHub в новой тёмной палитре дизайн-системы.
// Структура hero billboard + leader strip + sport rail + FocusCard 1-в-1 с
// claude-design/project/SportHub Header - Standalone Source.html.
//
// Layout:
// - sm (480-): одна колонка, FocusCard под sport-rail, leader-strip в столбик, CTA full-width
// - md (768): leader-strip 2 колонки рядом, FocusCard под рейлом
// - lg (1024+): hero billboard 2 колонки (1.3fr / 0.7fr), FocusCard прижат справа сверху
// - xxl (1440): контейнер достигает потолка max-w-[1440px]
// - 2k (1920+): симметричные пустые поля по бокам
//
// Карта: НЕ трогаем — внутренняя логика MapSection (Yandex Maps Phase 19) сохраняется,
// внешняя обёртка автоматически подстраивается через изменённые CSS-токены.
import Link from 'next/link';

import { buildTrainerDirectory, getTrainerAvailability } from '@/components/trainers';
import { PopularNearby } from '@/components/clubs';
import { HeroSportMarquee } from '@/components/home/HeroSportMarquee';
import { MapSection } from '@/components/map';
import { getUpcomingSessions, UpcomingSessions } from '@/components/schedule';
import { CatalogResultsSection, SearchControlsPreview } from '@/components/search';
import {
  getBookings,
  getOfferings,
  getPublishedClubs,
  getPublishedTrainers,
  getSchedule,
  getSpecialties,
  getSports,
  getTags,
  getTrainerClubLinks,
} from '@/lib/db';
import { computeClubReliability, computeTrainerReliability } from '@sporthub/domain';
import { formatDate, formatPrice, getDateKeyInTimeZone } from '@/lib/utils';

// Витрина читает живые JSON-данные после publish/edit/delete провайдеров.
export const dynamic = 'force-dynamic';

export default async function Home() {
  const [
    clubs,
    clubSchedule,
    offerings,
    specialties,
    sports,
    tags,
    trainerSchedule,
    trainers,
    trainerClubLinks,
    bookings,
  ] = await Promise.all([
    // Phase 27 Step 27.12: публичные SSR-витрины читают только не-hidden коллекции,
    // чтобы скрытые админом публикации не оставались в выдаче, на карте, в счётчиках
    // и featured-блоке. Хелперы симметричны фильтру в /api/clubs и /api/trainers.
    getPublishedClubs(),
    getSchedule(),
    getOfferings(),
    getSpecialties(),
    getSports(),
    getTags(),
    getSchedule({ ownerType: 'trainer' }),
    getPublishedTrainers(),
    getTrainerClubLinks({ status: 'confirmed' }),
    getBookings(),
  ]);

  // Phase 25 Step 25.13: публичные reliability-бейджи. SSR-снапшот один раз для всех карточек.
  const reliabilityByClubId = new Map(
    clubs.map((club) => [club.id, computeClubReliability(bookings, club.id)]),
  );
  const reliabilityByTrainerId = new Map(
    trainers.map((trainer) => [trainer.id, computeTrainerReliability(bookings, trainer.id)]),
  );

  const todayDateKey = getDateKeyInTimeZone();
  const upcomingSessions = getUpcomingSessions({
    clubs,
    schedule: clubSchedule,
    targetDate: todayDateKey,
  });
  const searchFilterSports = sports.map((sport) => ({
    id: sport.id,
    name: sport.name,
    icon: sport.icon,
  }));
  const trainerDirectory = buildTrainerDirectory({
    clubs,
    offerings,
    schedule: trainerSchedule,
    specialties,
    sports: searchFilterSports,
    trainers,
    trainerClubLinks,
    targetDate: todayDateKey,
  });
  const trainerAvailability = getTrainerAvailability({
    schedule: trainerSchedule,
    trainers: trainerDirectory,
    targetDate: todayDateKey,
  });

  // Лидеры каталога: top-1 по рейтингу, при равенстве — по числу отзывов.
  const featuredClub = [...clubs].sort((left, right) => {
    if (right.rating !== left.rating) return right.rating - left.rating;
    return right.reviewCount - left.reviewCount;
  })[0];
  const featuredTrainer = [...trainerDirectory].sort((left, right) => {
    if (right.rating !== left.rating) return right.rating - left.rating;
    return right.reviewCount - left.reviewCount;
  })[0];

  // Ближайшая сессия для FocusCard. Если нет — показываем заглушку.
  const focusSession = upcomingSessions[0];

  // Пустой каталог: оба featured отсутствуют → показываем общий банер под leader strip.
  const isCatalogEmpty = featuredClub === undefined && featuredTrainer === undefined;

  const upcomingSessionsLabel = formatDate(todayDateKey, { day: 'numeric', month: 'long' });
  const trainerAvailabilityLabel = formatDate(trainerAvailability[0]?.date ?? todayDateKey, {
    day: 'numeric',
    month: 'long',
  });

  return (
    <main className="min-h-screen overflow-x-hidden bg-[var(--ui-bg-deep)] px-3 py-6 sm:px-4 md:px-6 lg:px-10">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 lg:gap-10">
        {/* ========== HERO BILLBOARD ========== */}
        <section
          aria-label="Главный экран"
          className="relative overflow-hidden rounded-[24px] border border-[#BFDFD2]/20 bg-[#0A1029] text-[var(--ui-bg)] p-6 sm:p-8 lg:rounded-[28px] lg:p-12 before:pointer-events-none before:absolute before:inset-0 before:[background:radial-gradient(ellipse_600px_400px_at_100%_100%,rgba(80,188,147,0.16),transparent_60%),radial-gradient(ellipse_400px_300px_at_0%_0%,rgba(131,211,181,0.10),transparent_60%),repeating-linear-gradient(135deg,rgba(255,255,255,0.025)_0_1px,transparent_1px_16px)]"
        >
          {/* Watermark "SH" — фоновая марка лайма в правом нижнем углу */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-10 -right-5 select-none font-display text-[180px] leading-[0.85] tracking-[-0.02em] text-[var(--ui-lime)] opacity-[0.06] sm:text-[240px] lg:text-[320px]"
          >
            SH
          </span>

          {/* Grid: явный grid-cols-1 на mobile (без него grid создаёт авто-колонку
              под максимум contento и H1 в Bowlby растягивает её до ~988px → горизонтальный
              скролл на 480). min-w-0 на детях разрешает им сжиматься ниже content-size. */}
          <div className="relative z-10 grid grid-cols-1 gap-8 lg:grid-cols-[1.3fr_0.7fr] lg:items-start">
            {/* === Левая колонка: badges + H1 + lede + sport rail + CTA === */}
            <div className="flex min-w-0 flex-col gap-6">
              {/* Strip-badges row. Текст одной нодой — чтобы getByText находил полную фразу
                  (см. home-page.test.tsx, publish-catalog-flow.test.tsx). */}
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <span className="inline-flex items-center gap-2 rounded-full bg-[var(--ui-lime-soft)] px-3.5 py-[7px] font-body text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ui-lime)] sm:text-[11px]">
                  Samara active city
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-[#BFDFD2]/40 bg-transparent px-3.5 py-[7px] font-body text-[10px] font-bold tabular-nums uppercase tracking-[0.14em] text-[var(--ui-bg)] sm:text-[11px]">
                  {clubs.length} клубов в каталоге
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-[var(--ui-orange-soft)] px-3.5 py-[7px] font-body text-[10px] font-bold tabular-nums uppercase tracking-[0.14em] text-[var(--ui-orange)] sm:text-[11px]">
                  {trainerDirectory.length} тренеров в каталоге
                </span>
              </div>

              {/* H1 — Bowlby clamp, ключевое слово lime.
                  max-w ставим только с lg+ (на mobile H1 ширина = ширина контейнера). */}
              <h1 className="m-0 w-full font-display text-[clamp(36px,8vw,72px)] uppercase leading-[0.92] tracking-[-0.01em] text-[var(--ui-bg)] lg:max-w-[720px] lg:text-[clamp(48px,5.4vw,84px)]">
                Найди <span className="text-[var(--ui-lime)]">спорт</span> в своём ритме
              </h1>

              {/* Lede — на mobile занимает всю ширину, max-w только с lg+ */}
              <p className="m-0 w-full font-body text-[15px] leading-relaxed text-[#BFDFD2] sm:text-[16px] lg:max-w-[520px]">
                SportHub собирает клубы, студии, персональных тренеров и спортивные слоты Самары в
                одной витрине: сначала быстрый поиск и фильтры, потом выдача на карте, популярные
                карточки и ближайшие окна для записи.
              </p>

              {/* Phase 30.10: декоративная бегущая лента спорт-чипов в hero.
                  Реальный sport-фильтр живёт ниже в SportFilters — здесь
                  только визуальная подложка, поэтому без onClick/cursor:pointer. */}
              {searchFilterSports.length > 0 ? (
                <HeroSportMarquee sports={searchFilterSports.slice(0, 16)} />
              ) : null}

              {/* 2 CTA — на mobile full-width в столбик, на md+ в строку */}
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Link
                  href="/#results"
                  className="inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full border-2 border-[var(--ui-lime)] bg-[var(--ui-lime)] px-6 py-3 font-body text-[12px] font-bold uppercase tracking-[0.10em] text-[var(--ui-ink)] no-underline transition-all hover:bg-[var(--ui-lime-hov)] hover:border-[var(--ui-lime-hov)] sm:text-[13px]"
                >
                  Открыть выдачу
                </Link>
                <Link
                  href="/#availability"
                  className="inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full border-2 border-[#BFDFD2]/40 bg-transparent px-6 py-3 font-body text-[12px] font-bold uppercase tracking-[0.10em] text-[var(--ui-bg)] no-underline transition-all hover:border-[var(--ui-lime)] hover:text-[var(--ui-lime)] sm:text-[13px]"
                >
                  Смотреть слоты и окна
                </Link>
              </div>
            </div>

            {/* === Правая колонка: FocusCard "Сегодня в фокусе" === */}
            <aside className="relative min-w-0 overflow-hidden rounded-[22px] border border-[var(--ui-line)] bg-[var(--ui-bg)] p-5 transition-colors hover:border-[var(--ui-lime)] after:pointer-events-none after:absolute after:-right-10 after:-top-10 after:size-[140px] after:rounded-full after:[background:radial-gradient(circle,var(--ui-lime-soft)_0%,transparent_70%)]">
              <div className="relative z-10 flex flex-col gap-2.5">
                <div className="flex items-center justify-between gap-2.5">
                  <span className="font-body text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ui-lime)]">
                    Сегодня в фокусе
                  </span>
                  {focusSession ? (
                    <span className="inline-flex items-center gap-1.5 font-body text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ui-orange)]">
                      <span className="size-2 animate-pulse rounded-full bg-[var(--ui-orange)] [box-shadow:0_0_0_0_rgba(251,97,25,0.6)]" />
                      LIVE
                    </span>
                  ) : null}
                </div>

                <p className="font-display text-[40px] tabular-nums leading-[0.9] tracking-[0.02em] text-[var(--ui-ink)]">
                  {focusSession?.startTime ?? '—:—'}
                </p>

                <h3 className="m-0 font-body text-[17px] font-bold uppercase leading-tight tracking-[0.02em] text-[var(--ui-ink)]">
                  {focusSession?.title ?? 'Слоты скоро появятся'}
                </h3>

                <p className="m-0 font-body text-[13px] leading-[1.4] text-[var(--ui-muted)]">
                  {focusSession
                    ? focusSession.clubName
                    : `Проверь расписание на ${upcomingSessionsLabel}`}
                </p>

                <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-[var(--ui-line)] pt-3.5">
                  <p className="m-0 font-body text-[12px] font-medium text-[var(--ui-muted)]">
                    <strong className="mr-1 font-display text-[14px] font-normal tabular-nums text-[var(--ui-lime)]">
                      {upcomingSessions.length}
                    </strong>
                    {upcomingSessions.length === 1 ? 'занятие' : 'занятий'} сегодня
                  </p>
                  {focusSession ? (
                    <Link
                      href={`/booking/${focusSession.id}`}
                      className="inline-flex items-center justify-center rounded-full border-2 border-[var(--ui-lime)] bg-[var(--ui-lime)] px-3.5 py-1.5 font-body text-[11px] font-bold uppercase tracking-[0.10em] text-[var(--ui-bg)] no-underline transition-all hover:-translate-y-px hover:border-[var(--ui-lime-hov)] hover:bg-[var(--ui-lime-hov)]"
                    >
                      Записаться
                    </Link>
                  ) : null}
                </div>
              </div>
            </aside>
          </div>
        </section>

        {/* ========== LEADER STRIP — 2 карточки лидеров каталога ========== */}
        <section
          aria-label="Лидеры каталога"
          className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5"
        >
          {/* Лидер-клуб */}
          <article className="group relative overflow-hidden rounded-[22px] border border-[var(--ui-line)] bg-[var(--ui-card-2)] p-5 transition-all hover:-translate-y-0.5 hover:border-[var(--ui-lime)]">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute right-5 top-5 select-none font-display text-[56px] leading-[0.85] tracking-[-0.02em] text-ink/[0.04]"
            >
              01
            </span>
            <div className="relative z-10">
              <div className="flex items-center gap-2 font-body text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ui-lime)]">
                <span className="h-px w-6 bg-current opacity-50" />
                Клуб
              </div>
              {featuredClub ? (
                <>
                  <div className="mt-3.5 flex items-start gap-3.5">
                    <span className="flex size-14 shrink-0 items-center justify-center rounded-[16px] border border-[rgba(131,211,181,0.3)] bg-[var(--ui-lime-soft)] font-display text-[22px] uppercase text-[var(--ui-lime-hov)]">
                      {featuredClub.name.trim().charAt(0)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="m-0 font-body text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--ui-muted)]">
                        Топ рейтинга
                      </p>
                      <h3 className="m-0 mt-1 font-display text-[19px] uppercase leading-[1.05] text-[var(--ui-ink)]">
                        {featuredClub.name}
                      </h3>
                    </div>
                  </div>
                  <p className="relative z-10 m-0 mt-3 font-body text-[13px] leading-[1.5] text-[var(--ui-muted)]">
                    {featuredClub.shortDescription}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <div className="flex min-w-[78px] flex-col gap-0.5 rounded-[12px] border border-[var(--ui-line)] bg-[var(--ui-bg)] px-3 py-2">
                      <span className="font-body text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ui-muted)]">
                        Рейтинг
                      </span>
                      <span className="font-display text-[16px] tabular-nums leading-none text-[var(--ui-ink)]">
                        {featuredClub.rating.toFixed(1)}
                      </span>
                    </div>
                    <div className="flex min-w-[78px] flex-col gap-0.5 rounded-[12px] border border-[var(--ui-line)] bg-[var(--ui-bg)] px-3 py-2">
                      <span className="font-body text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ui-muted)]">
                        Отзывы
                      </span>
                      <span className="font-display text-[16px] tabular-nums leading-none text-[var(--ui-ink)]">
                        {featuredClub.reviewCount}
                      </span>
                    </div>
                    <span className="ml-auto inline-flex items-center gap-1 whitespace-nowrap rounded-[14px] bg-[var(--ui-lime)] px-4 py-3 font-display text-[16px] tabular-nums tracking-[0.02em] text-[var(--ui-bg)]">
                      <span className="mr-1 font-body text-[9px] font-bold uppercase tracking-[0.18em] opacity-70">
                        от
                      </span>
                      {formatPrice(featuredClub.priceFrom)}
                    </span>
                  </div>
                </>
              ) : (
                <p className="relative z-10 m-0 mt-4 font-body text-[13px] leading-[1.5] text-[var(--ui-muted)]">
                  Клубы появятся после первой публикации из кабинета провайдера.
                </p>
              )}
            </div>
          </article>

          {/* Лидер-тренер (orange акцент) */}
          <article className="group relative overflow-hidden rounded-[22px] border border-[var(--ui-line)] bg-[var(--ui-card-2)] p-5 transition-all hover:-translate-y-0.5 hover:border-[var(--ui-orange)]">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute right-5 top-5 select-none font-display text-[56px] leading-[0.85] tracking-[-0.02em] text-ink/[0.04]"
            >
              02
            </span>
            <div className="relative z-10">
              <div className="flex items-center gap-2 font-body text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ui-orange)]">
                <span className="h-px w-6 bg-current opacity-50" />
                Тренер
              </div>
              {featuredTrainer ? (
                <>
                  <div className="mt-3.5 flex items-start gap-3.5">
                    <span className="flex size-14 shrink-0 items-center justify-center rounded-[16px] border border-[rgba(251,97,25,0.3)] bg-[var(--ui-orange-soft)] font-display text-[22px] uppercase text-[var(--ui-orange)]">
                      {featuredTrainer.name.trim().charAt(0)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="m-0 font-body text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--ui-muted)]">
                        Топ рейтинга
                      </p>
                      <h3 className="m-0 mt-1 font-display text-[19px] uppercase leading-[1.05] text-[var(--ui-ink)]">
                        {featuredTrainer.name}
                      </h3>
                    </div>
                  </div>
                  <p className="relative z-10 m-0 mt-3 font-body text-[13px] leading-[1.5] text-[var(--ui-muted)]">
                    {featuredTrainer.primaryOfferingTitle ?? featuredTrainer.bio}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <div className="flex min-w-[78px] flex-col gap-0.5 rounded-[12px] border border-[var(--ui-line)] bg-[var(--ui-bg)] px-3 py-2">
                      <span className="font-body text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ui-muted)]">
                        Рейтинг
                      </span>
                      <span className="font-display text-[16px] tabular-nums leading-none text-[var(--ui-ink)]">
                        {featuredTrainer.rating.toFixed(1)}
                      </span>
                    </div>
                    <div className="flex min-w-[78px] flex-col gap-0.5 rounded-[12px] border border-[var(--ui-line)] bg-[var(--ui-bg)] px-3 py-2">
                      <span className="font-body text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ui-muted)]">
                        Отзывы
                      </span>
                      <span className="font-display text-[16px] tabular-nums leading-none text-[var(--ui-ink)]">
                        {featuredTrainer.reviewCount}
                      </span>
                    </div>
                    <span className="ml-auto inline-flex items-center gap-1 whitespace-nowrap rounded-[14px] bg-[var(--ui-orange)] px-4 py-3 font-display text-[16px] tabular-nums tracking-[0.02em] text-[var(--ui-bg)]">
                      <span className="mr-1 font-body text-[9px] font-bold uppercase tracking-[0.18em] opacity-70">
                        от
                      </span>
                      {formatPrice(featuredTrainer.priceFrom)}
                    </span>
                  </div>
                </>
              ) : (
                <p className="relative z-10 m-0 mt-4 font-body text-[13px] leading-[1.5] text-[var(--ui-muted)]">
                  Тренеры появятся после первой публикации и первых доступных услуг.
                </p>
              )}
            </div>
          </article>
        </section>

        {/* Общий empty-state, если в каталоге нет ни клубов, ни тренеров. */}
        {isCatalogEmpty ? (
          <p className="m-0 rounded-[18px] border border-dashed border-[var(--ui-line)] bg-[var(--ui-card)]/60 px-5 py-4 font-body text-[14px] leading-relaxed text-[var(--ui-muted)]">
            Каталог пока пуст. Витрина начнёт заполняться новыми публикациями из кабинета
            провайдера.
          </p>
        ) : null}

        {/* ========== SEARCH SECTION ========== */}
        {/* Внутренняя UI-логика SearchControlsPreview сохраняется (Phase 27 актуальна).
            Палитра автоматически тёмная через изменённые CSS-токены. */}
        <SearchControlsPreview
          clubCount={clubs.length}
          sports={searchFilterSports}
          trainerCount={trainerDirectory.length}
        />

        {/* ========== MAP ==========
            Phase 28: НЕ трогаем — внутренний рендер Yandex Maps (Phase 19) сохраняется.
            Стилизация карты под тёмную палитру — отдельной фазой. */}
        <MapSection clubs={clubs} sports={searchFilterSports} trainers={trainerDirectory} />

        {/* ========== ОСТАЛЬНЫЕ СЕКЦИИ КАТАЛОГА ==========
            Phase 28: палитра автоматически тёмная через токены.
            Точечная переверстка под UI Kit-классы — Phase 29+. */}
        <CatalogResultsSection
          clubs={clubs}
          sports={searchFilterSports}
          tags={tags}
          trainers={trainerDirectory}
          reliabilityByClubId={reliabilityByClubId}
          reliabilityByTrainerId={reliabilityByTrainerId}
        />
        <PopularNearby
          clubs={clubs}
          sports={searchFilterSports}
          tags={tags}
          trainers={trainerDirectory}
          reliabilityByClubId={reliabilityByClubId}
          reliabilityByTrainerId={reliabilityByTrainerId}
        />
        <UpcomingSessions
          dateLabel={upcomingSessionsLabel}
          sessions={upcomingSessions}
          trainerDateLabel={trainerAvailabilityLabel}
          trainerSlots={trainerAvailability}
        />
      </div>
    </main>
  );
}
