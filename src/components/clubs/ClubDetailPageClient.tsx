'use client';

import { useMemo } from 'react';

import { Badge, Card, Rating } from '@/components/ui';
import { formatDate, formatPhone, formatPrice } from '@/lib/utils';
import type { Club, Review, Schedule, Sport, Trainer } from '@/types';

type ReviewWithAuthor = Review & {
  authorName: string;
};

type ClubDetailPageClientProps = {
  club: Club;
  sports: Sport[];
  trainers: Trainer[];
  schedule: Schedule[];
  reviews: Review[];
  reviewAuthors: Record<number, string>;
};

type EnrichedScheduleItem = Schedule & {
  trainerName: string;
  sportName: string;
  availableSpots: number;
};

type ScheduleGroup = {
  date: string;
  label: string;
  items: EnrichedScheduleItem[];
};

function formatDayLabel(date: string) {
  const label = formatDate(date, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return label ? `${label.charAt(0).toUpperCase()}${label.slice(1)}` : date;
}

function buildScheduleGroups(
  schedule: Schedule[],
  trainers: Trainer[],
  sports: Sport[],
): ScheduleGroup[] {
  const trainerNames = new Map(trainers.map((trainer) => [trainer.id, trainer.name]));
  const sportNames = new Map(sports.map((sport) => [sport.id, sport.name]));
  const groupedSchedule = new Map<string, EnrichedScheduleItem[]>();

  [...schedule]
    .sort((left, right) => {
      const leftTimestamp = `${left.date}T${left.startTime}`;
      const rightTimestamp = `${right.date}T${right.startTime}`;

      return leftTimestamp.localeCompare(rightTimestamp);
    })
    .forEach((slot) => {
      const currentGroup = groupedSchedule.get(slot.date) ?? [];

      currentGroup.push({
        ...slot,
        trainerName: trainerNames.get(slot.trainerId) ?? 'Тренер SportHub',
        sportName: sportNames.get(slot.sportId) ?? 'Занятие',
        availableSpots: Math.max(slot.capacity - slot.bookedCount, 0),
      });

      groupedSchedule.set(slot.date, currentGroup);
    });

  return Array.from(groupedSchedule.entries()).map(([date, items]) => ({
    date,
    label: formatDayLabel(date),
    items,
  }));
}

function mapReviewsWithAuthors(
  reviews: Review[],
  reviewAuthors: Record<number, string>,
): ReviewWithAuthor[] {
  return reviews.map((review) => ({
    ...review,
    authorName: reviewAuthors[review.userId] ?? 'Спортсмен SportHub',
  }));
}

function MediaStub({ label, className }: { label: string; className?: string }) {
  return (
    <div
      className={`flex items-center justify-center rounded-card border border-dashed border-line bg-canvas px-4 py-6 text-center text-xs font-semibold uppercase tracking-[0.24em] text-muted ${className ?? ''}`}
    >
      {label}
    </div>
  );
}

export function ClubDetailPageClient({
  club,
  reviewAuthors,
  reviews,
  schedule,
  sports,
  trainers,
}: ClubDetailPageClientProps) {
  const reviewItems = useMemo(() => mapReviewsWithAuthors(reviews, reviewAuthors), [reviewAuthors, reviews]);
  const scheduleGroups = useMemo(
    () => buildScheduleGroups(schedule, trainers, sports),
    [schedule, sports, trainers],
  );

  return (
    <div className="min-h-screen px-6 py-8 sm:px-8 lg:px-12">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <Card className="overflow-hidden p-4 sm:p-5">
            <div className="grid gap-4 md:grid-cols-[1.15fr_0.85fr]">
              <MediaStub label="Фото клуба" className="min-h-72 md:min-h-[24rem]" />
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-1">
                <MediaStub label="Фото клуба" className="min-h-32" />
                <MediaStub label="Фото клуба" className="min-h-32" />
              </div>
            </div>
          </Card>

          <Card className="flex h-full flex-col gap-5 p-6 sm:p-7">
            <div className="flex flex-wrap gap-2">
              <Badge tone="accent">{club.city}</Badge>
              <Badge tone="outline">{club.reviewCount} отзывов</Badge>
              <Badge tone="teal">{club.distanceKm.toFixed(1)} км</Badge>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
                Club profile
              </p>
              <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
                {club.name}
              </h1>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Rating value={club.rating} />
                <span className="text-sm text-muted">{club.address}</span>
              </div>
            </div>

            <p className="text-base leading-8 text-muted">{club.description}</p>

            <div className="grid gap-4 rounded-card border border-line bg-canvas p-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                  Контакты
                </p>
                <div className="mt-3 space-y-2 text-sm leading-7 text-ink">
                  <p>{formatPhone(club.phone)}</p>
                  {club.email ? <p>{club.email}</p> : null}
                  {club.website ? <p>{club.website}</p> : null}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                  Цена от
                </p>
                <p className="mt-3 text-2xl font-semibold text-ink">
                  {formatPrice(club.priceFrom)}
                </p>
                <p className="mt-2 text-sm leading-7 text-muted">{club.shortDescription}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {club.tags.map((tag) => (
                <Badge key={tag} tone="outline">
                  {tag}
                </Badge>
              ))}
              {club.amenities.map((amenity) => (
                <Badge key={amenity} tone="teal">
                  {amenity}
                </Badge>
              ))}
            </div>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
          <Card className="p-6 sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
                  Sport focus
                </p>
                <h2 className="mt-2 font-display text-3xl font-semibold text-ink">
                  Направления клуба
                </h2>
              </div>
              <Badge tone="outline">{sports.length} направления</Badge>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              {sports.map((sport) => (
                <div
                  key={sport.id}
                  className="flex min-w-[10rem] flex-1 items-center gap-3 rounded-card border border-line bg-canvas px-4 py-4"
                >
                  <span className="text-2xl" aria-hidden="true">
                    {sport.icon}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-ink">{sport.name}</p>
                    <p className="text-xs leading-6 text-muted">{sport.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6 sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
                  Coaching team
                </p>
                <h2 className="mt-2 font-display text-3xl font-semibold text-ink">Тренеры клуба</h2>
              </div>
              <Badge tone="outline">{trainers.length} тренера</Badge>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {trainers.map((trainer) => (
                <div
                  key={trainer.id}
                  className="grid gap-4 rounded-card border border-line bg-canvas p-4 sm:grid-cols-[7rem_1fr]"
                >
                  <MediaStub label="Фото тренера" className="min-h-28" />
                  <div>
                    <p className="text-lg font-semibold text-ink">{trainer.name}</p>
                    <p className="mt-1 text-sm leading-7 text-muted">{trainer.bio}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Badge tone="outline">{trainer.experienceYears} лет опыта</Badge>
                      <Badge tone="outline">{trainer.reviewCount} отзывов</Badge>
                      <Badge tone="teal">{formatPrice(trainer.priceFrom)}</Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {trainer.specialties.map((specialty) => (
                        <Badge key={specialty} tone="outline">
                          {specialty}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </section>

        <section>
          <Card className="p-6 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
                  Weekly schedule
                </p>
                <h2 className="mt-2 font-display text-3xl font-semibold text-ink">
                  Расписание на неделю
                </h2>
              </div>
              <Badge tone="outline">{schedule.length} слотов</Badge>
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-2">
              {scheduleGroups.map((group) => (
                <div key={group.date} className="rounded-card border border-line bg-canvas p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-ink">{group.label}</h3>
                    <Badge tone="outline">{group.items.length} занятия</Badge>
                  </div>

                  <div className="mt-4 space-y-4">
                    {group.items.map((slot) => (
                      <div key={slot.id} className="rounded-card border border-line bg-panel p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted">
                              {slot.sportName}
                            </p>
                            <p className="mt-2 text-xl font-semibold text-ink">{slot.title}</p>
                            <p className="mt-2 text-sm leading-7 text-muted">
                              {slot.startTime} - {slot.endTime}, {slot.trainerName}
                            </p>
                          </div>

                          <div className="rounded-pill border border-line bg-canvas px-4 py-2 text-sm font-semibold text-muted">
                            Запись откроется позже
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <Badge tone="outline">{formatPrice(slot.price)}</Badge>
                          <Badge tone="outline">Свободно {slot.availableSpots} мест</Badge>
                          <Badge tone="teal">{slot.room ?? 'Зал уточняется'}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </section>

        <section>
          <Card className="p-6 sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
                  Community feedback
                </p>
                <h2 className="mt-2 font-display text-3xl font-semibold text-ink">Отзывы клуба</h2>
              </div>
              <Badge tone="outline">{reviewItems.length} отзывов</Badge>
            </div>

            <div className="mt-6 space-y-4">
              {reviewItems.map((review) => (
                <div key={review.id} className="rounded-card border border-line bg-canvas p-4">
                  <div className="flex gap-4">
                    <MediaStub label="Фото автора" className="min-h-16 min-w-16 px-3 py-3" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-ink">{review.authorName}</p>
                          <p className="text-sm text-muted">
                            {formatDate(review.createdAt, {
                              day: 'numeric',
                              month: 'long',
                            })}
                          </p>
                        </div>
                        <Rating value={review.rating} />
                      </div>
                      <p className="mt-3 text-sm leading-7 text-muted">{review.text}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}
