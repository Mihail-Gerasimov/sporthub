import Link from 'next/link';

import { Badge } from '@/components/ui';
import { PopularNearby } from '@/components/clubs';
import { MapPreviewSection } from '@/components/map';
import { getUpcomingSessions, UpcomingSessions } from '@/components/schedule';
import { SearchControlsPreview } from '@/components/search';
import { getClubs, getSchedule, getSports } from '@/lib/db';
import { formatDate, formatPrice, getDateKeyInTimeZone } from '@/lib/utils';

export default async function Home() {
  const clubs = await getClubs();
  const schedule = await getSchedule();
  const sports = await getSports();
  const todayDateKey = getDateKeyInTimeZone();
  const upcomingSessions = getUpcomingSessions({
    clubs,
    schedule,
    targetDate: todayDateKey,
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
  const searchFilterSports = sports.map((sport) => ({
    id: sport.id,
    name: sport.name,
    icon: sport.icon,
  }));

  return (
    <main className="min-h-screen px-6 py-8 sm:px-8 lg:px-12">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="relative overflow-hidden rounded-card border border-line bg-panel px-6 py-7 shadow-floating sm:px-8 sm:py-8 lg:px-10 lg:py-10">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(216,90,50,0.24),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(12,111,115,0.18),transparent_36%)]"
          />

          <div className="relative grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
            <div>
              <div className="flex flex-wrap gap-2">
                <Badge tone="accent">Samara active city</Badge>
                <Badge tone="outline">{clubs.length} клубов в каталоге</Badge>
                <Badge tone="teal">{upcomingSessions.length} слотов на сегодня</Badge>
              </div>

              <h1 className="mt-5 max-w-4xl font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl lg:text-6xl">
                Найди спорт в своём ритме
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-muted sm:text-lg">
                SportHub собирает клубы, студии и занятия Самары в одной витрине: сначала быстрый
                поиск и фильтры, потом карта, популярные места и ближайшие слоты на сегодня.
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
                  href="/#clubs"
                  className="rounded-pill bg-accent px-5 py-3 text-sm font-semibold text-panel transition-transform duration-200 hover:-translate-y-0.5"
                >
                  Смотреть клубы на карте
                </Link>
                <Link
                  href="/#upcoming-sessions"
                  className="rounded-pill border border-line bg-panel-strong px-5 py-3 text-sm font-semibold text-ink transition-colors hover:border-accent/30 hover:text-accent"
                >
                  Открыть занятия на сегодня
                </Link>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-card border border-line bg-canvas/90 p-5 shadow-card">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
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
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                      На сегодня
                    </p>
                    <p className="mt-2 text-sm leading-7 text-ink">
                      {upcomingSessions.length > 0
                        ? `${upcomingSessions.length} занятия доступны для быстрой записи.`
                        : 'Свободных слотов на сегодня пока нет.'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-card border border-line bg-panel-strong p-5 shadow-card">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
                  Сильный клуб дня
                </p>
                <div className="mt-4">
                  {featuredClub ? (
                    <>
                      <p className="text-xl font-semibold text-ink">{featuredClub.name}</p>
                      <p className="mt-2 text-sm leading-7 text-muted">
                        {featuredClub.shortDescription}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Badge tone="outline">{featuredClub.rating.toFixed(1)} рейтинг</Badge>
                        <Badge tone="outline">{featuredClub.reviewCount} отзывов</Badge>
                        <Badge tone="accent">{formatPrice(featuredClub.priceFrom)}</Badge>
                      </div>
                    </>
                  ) : (
                    <p className="mt-2 text-sm leading-7 text-muted">
                      Каталог клубов пока пуст. После загрузки данных здесь появится лучший клуб
                      дня.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <SearchControlsPreview sports={searchFilterSports} />
        <MapPreviewSection clubs={clubs} sports={searchFilterSports} />
        <PopularNearby clubs={clubs} sports={searchFilterSports} />
        <UpcomingSessions sessions={upcomingSessions} dateLabel={upcomingSessionsLabel} />
      </div>
    </main>
  );
}
