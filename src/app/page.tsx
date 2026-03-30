import Link from 'next/link';

import { buildTrainerDirectory, getTrainerAvailability } from '@/components/trainers';
import { Badge } from '@/components/ui';
import { PopularNearby } from '@/components/clubs';
import { MapPreviewSection } from '@/components/map';
import { getUpcomingSessions, UpcomingSessions } from '@/components/schedule';
import { SearchControlsPreview } from '@/components/search';
import { getClubs, getOfferings, getSchedule, getSports, getTrainers } from '@/lib/db';
import { formatDate, formatPrice, getDateKeyInTimeZone } from '@/lib/utils';

export default async function Home() {
  const [clubs, clubSchedule, offerings, sports, trainerSchedule, trainers] = await Promise.all([
    getClubs(),
    getSchedule(),
    getOfferings(),
    getSports(),
    getSchedule({ ownerType: 'trainer' }),
    getTrainers(),
  ]);
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
    sports: searchFilterSports,
    trainers,
  });
  const trainerAvailability = getTrainerAvailability({
    schedule: trainerSchedule,
    trainers: trainerDirectory,
  });
  const featuredClub = [...clubs].sort((left, right) => {
    if (right.rating !== left.rating) {
      return right.rating - left.rating;
    }

    return right.reviewCount - left.reviewCount;
  })[0];
  const upcomingSessionsLabel = formatDate(todayDateKey, {
    day: 'numeric',
    month: 'long',
  });
  const trainerAvailabilityLabel = formatDate(trainerAvailability[0]?.date ?? todayDateKey, {
    day: 'numeric',
    month: 'long',
  });
  const featuredTrainer = [...trainerDirectory].sort((left, right) => {
    if (right.rating !== left.rating) {
      return right.rating - left.rating;
    }

    return right.reviewCount - left.reviewCount;
  })[0];

  return (
    <main className="min-h-screen px-6 py-8 sm:px-8 lg:px-12">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="rounded-card border border-line bg-panel px-6 py-7 sm:px-8 sm:py-8 lg:px-10 lg:py-10">
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
            <div>
              <div className="flex flex-wrap gap-2">
                <Badge tone="accent">Samara active city</Badge>
                <Badge tone="outline">{clubs.length} клубов в каталоге</Badge>
                <Badge tone="teal">{trainerDirectory.length} тренеров в каталоге</Badge>
              </div>

              <h1 className="mt-5 max-w-4xl font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl lg:text-6xl">
                Найди спорт в своём ритме
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
                SportHub собирает клубы, студии, персональных тренеров и спортивные слоты Самары в
                одной витрине: сначала быстрый поиск и фильтры, потом выдача на карте, популярные
                карточки и ближайшие окна для записи.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                {searchFilterSports.slice(0, 5).map((sport) => (
                  <span
                    key={sport.id}
                    className="rounded-pill border border-line bg-canvas px-4 py-2 text-sm font-medium text-ink"
                  >
                    {sport.icon} {sport.name}
                  </span>
                ))}
              </div>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/#results"
                  className="rounded-pill bg-accent px-5 py-3 text-sm font-semibold text-panel transition-transform duration-200 hover:-translate-y-0.5"
                >
                  Открыть выдачу
                </Link>
                <Link
                  href="/#availability"
                  className="rounded-pill border border-line bg-panel-strong px-5 py-3 text-sm font-semibold text-ink transition-colors hover:border-accent/30 hover:text-accent"
                >
                  Смотреть слоты и окна
                </Link>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-card border border-line bg-canvas/90 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                  Сегодня в фокусе
                </p>
                <div className="mt-4 space-y-3">
                  <div>
                    <p className="text-sm text-muted">Ближайший слот</p>
                    <p className="mt-1 text-xl font-semibold text-ink">
                      {upcomingSessions[0]?.title ?? 'Слоты скоро появятся'}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {upcomingSessions[0]
                        ? `${upcomingSessions[0].clubName}, ${upcomingSessions[0].startTime}`
                        : `Проверь расписание на ${upcomingSessionsLabel}`}
                    </p>
                  </div>
                  <div className="rounded-card border border-line bg-panel px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-muted">
                      На сегодня
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-ink">
                      {upcomingSessions.length > 0
                        ? `${upcomingSessions.length} занятия доступны для быстрой записи.`
                        : 'Свободных слотов на сегодня пока нет.'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-card border border-line bg-panel-strong p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                  Лидер каталога
                </p>
                <div className="mt-4">
                  {featuredClub && featuredTrainer ? (
                    <>
                      <p className="text-sm text-muted">Клуб</p>
                      <p className="text-xl font-semibold text-ink">{featuredClub.name}</p>
                      <p className="mt-2 text-sm leading-relaxed text-muted">
                        {featuredClub.shortDescription}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Badge tone="outline">{featuredClub.rating.toFixed(1)} рейтинг</Badge>
                        <Badge tone="outline">{featuredClub.reviewCount} отзывов</Badge>
                        <Badge tone="accent">{formatPrice(featuredClub.priceFrom)}</Badge>
                      </div>

                      <div className="mt-5 border-t border-line/80 pt-5">
                        <p className="text-sm text-muted">Тренер</p>
                        <p className="mt-1 text-xl font-semibold text-ink">
                          {featuredTrainer.name}
                        </p>
                        <p className="mt-2 text-sm leading-relaxed text-muted">
                          {featuredTrainer.primaryOfferingTitle ?? featuredTrainer.bio}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Badge tone="outline">{featuredTrainer.rating.toFixed(1)} рейтинг</Badge>
                          <Badge tone="outline">{featuredTrainer.reviewCount} отзывов</Badge>
                          <Badge tone="teal">{formatPrice(featuredTrainer.priceFrom)}</Badge>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="mt-2 text-sm leading-relaxed text-muted">
                      Каталог пока пуст. После загрузки данных здесь появятся сильные точки клубного
                      и тренерского каталога.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <SearchControlsPreview
          clubCount={clubs.length}
          sports={searchFilterSports}
          trainerCount={trainerDirectory.length}
        />
        <MapPreviewSection />
        <PopularNearby clubs={clubs} sports={searchFilterSports} trainers={trainerDirectory} />
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
