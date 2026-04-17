'use client';

import Link from 'next/link';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { z } from 'zod';

import { ActionNotice, Badge, Button, Card, Rating } from '@/components/ui';
import { formatCityDisplay, formatDate, formatPhone, formatPrice } from '@/lib/utils';
import { selectAthleteActionUserId, useAuthStore } from '@/stores/useAuthStore';
import type { Amenity, Club, Review, Schedule, Specialty, Sport, Tag, Trainer } from '@/types';

const AUTH_NOTICE_TIMEOUT_MS = 3200;

type ReviewWithAuthor = Review & {
  authorName: string;
};

type ClubDetailPageClientProps = {
  amenities: Amenity[];
  club: Club;
  reviews: Review[];
  reviewAuthors: Record<number, string>;
  schedule: Schedule[];
  specialties: Specialty[];
  sports: Sport[];
  tags: Tag[];
  trainers: Trainer[];
};

type ReviewFormState = {
  rating: number;
  text: string;
};

type ReviewFormErrors = {
  rating?: string;
  text?: string;
  submit?: string;
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

const reviewFormSchema = z.object({
  rating: z.number().int().min(1, 'Выбери оценку.'),
  text: z.string().trim().min(1, 'Напиши пару слов о впечатлении.'),
});

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
        trainerName: trainerNames.get(slot.trainerId ?? -1) ?? 'Тренер SportHub',
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
      className={`flex items-center justify-center rounded-card border border-dashed border-line bg-canvas px-4 py-6 text-center text-xs font-semibold uppercase tracking-[0.10em] text-muted ${className ?? ''}`}
    >
      {label}
    </div>
  );
}

function SectionEmptyState({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <div
      data-testid={testId}
      className="rounded-card border border-dashed border-line bg-canvas px-5 py-5 text-sm leading-relaxed text-muted"
    >
      {children}
    </div>
  );
}

function getReviewValidationErrors(form: ReviewFormState): ReviewFormErrors {
  const validationResult = reviewFormSchema.safeParse(form);

  if (validationResult.success) {
    return {};
  }

  return validationResult.error.issues.reduce<ReviewFormErrors>((accumulator, issue) => {
    const fieldName = issue.path[0];

    if (fieldName === 'rating' || fieldName === 'text') {
      accumulator[fieldName] = issue.message;
    }

    return accumulator;
  }, {});
}

export function ClubDetailPageClient({
  amenities,
  club,
  reviewAuthors,
  reviews,
  schedule,
  specialties,
  sports,
  tags,
  trainers,
}: ClubDetailPageClientProps) {
  const accountType = useAuthStore((state) => state.accountType);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const sessionUser = useAuthStore((state) => state.user);
  const athleteActionUserId = useAuthStore(selectAthleteActionUserId);
  const [notice, setNotice] = useState<string | null>(null);
  const [reviewItems, setReviewItems] = useState<ReviewWithAuthor[]>(() =>
    mapReviewsWithAuthors(reviews, reviewAuthors),
  );
  const [reviewForm, setReviewForm] = useState<ReviewFormState>({
    rating: 0,
    text: '',
  });
  const [reviewErrors, setReviewErrors] = useState<ReviewFormErrors>({});
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  /* Словари id → name для отображения */
  const tagNameById = useMemo(() => Object.fromEntries(tags.map((t) => [t.id, t.name])), [tags]);
  const amenityNameById = useMemo(
    () => Object.fromEntries(amenities.map((a) => [a.id, a.name])),
    [amenities],
  );
  const specialtyNameById = useMemo(
    () => Object.fromEntries(specialties.map((s) => [s.id, s.name])),
    [specialties],
  );
  const scheduleGroups = useMemo(
    () => buildScheduleGroups(schedule, trainers, sports),
    [schedule, sports, trainers],
  );
  const isAthlete = isAuthenticated && accountType === 'athlete' && athleteActionUserId !== null;
  const hasMediaGallery = club.imageUrls.length > 0;

  useEffect(() => {
    if (!notice) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setNotice(null);
    }, AUTH_NOTICE_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [notice]);

  function showActionNotice(message: string) {
    setNotice(message);
  }

  async function handleReviewSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isAthlete || athleteActionUserId === null) {
      showActionNotice('Чтобы оставить отзыв, войдите или зарегистрируйтесь как спортсмен');
      return;
    }

    const normalizedReviewForm = {
      rating: reviewForm.rating,
      text: reviewForm.text.trim(),
    } satisfies ReviewFormState;
    const validationErrors = getReviewValidationErrors(normalizedReviewForm);

    setReviewErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setIsSubmittingReview(true);

    try {
      const response = await fetch('/api/reviews', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: athleteActionUserId,
          clubId: club.id,
          rating: normalizedReviewForm.rating,
          text: normalizedReviewForm.text,
        }),
      });
      const payload = (await response.json()) as
        | { success: true; data: Review }
        | { success: false; error?: string };

      if (!response.ok || !payload.success) {
        setReviewErrors({
          submit: 'Не удалось отправить отзыв.',
        });
        return;
      }

      setReviewItems((currentValue) => [
        {
          ...payload.data,
          authorName:
            sessionUser?.name ?? reviewAuthors[payload.data.userId] ?? 'Спортсмен SportHub',
        },
        ...currentValue,
      ]);
      setReviewForm({
        rating: 0,
        text: '',
      });
      setReviewErrors({});
      showActionNotice('Отзыв отправлен.');
    } catch (error) {
      console.error('Ошибка отправки отзыва со страницы клуба:', error);
      setReviewErrors({
        submit: 'Не удалось отправить отзыв.',
      });
    } finally {
      setIsSubmittingReview(false);
    }
  }

  return (
    <div className="min-h-screen px-6 py-8 sm:px-8 lg:px-12">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          {/* Инфо клуба — на мобильном сверху, на xl справа */}
          <Card className="flex h-full flex-col gap-5 p-6 xl:order-last sm:p-7">
            <div className="flex flex-wrap gap-2">
              <Badge tone="accent">{formatCityDisplay(club.city)}</Badge>
              <Badge tone="outline">{club.reviewCount} отзывов</Badge>
              <Badge tone="teal">{club.distanceKm.toFixed(1)} км</Badge>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
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

            <p className="break-words text-base leading-relaxed text-muted">{club.description}</p>

            <div className="grid gap-4 rounded-card border border-line bg-canvas p-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                  Контакты
                </p>
                <div className="mt-3 space-y-2 text-sm leading-relaxed text-ink">
                  <p>{formatPhone(club.phone)}</p>
                  {club.email ? <p>{club.email}</p> : null}
                  {club.website ? <p>{club.website}</p> : null}
                  {club.vk ? (
                    <a
                      href={club.vk}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-accent-strong hover:underline"
                    >
                      VK
                    </a>
                  ) : null}
                  {club.telegram ? (
                    <a
                      href={club.telegram}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-accent-strong hover:underline"
                    >
                      Telegram
                    </a>
                  ) : null}
                  {club.facebook ? (
                    <a
                      href={club.facebook}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-accent-strong hover:underline"
                    >
                      Facebook
                    </a>
                  ) : null}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                  Цена от
                </p>
                <p className="mt-3 text-2xl font-semibold text-ink">
                  {formatPrice(club.priceFrom)}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-muted">{club.shortDescription}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {club.tagIds.map((id) => (
                <Badge key={`tag-${id}`} tone="outline">
                  {tagNameById[id] ?? `#${id}`}
                </Badge>
              ))}
              {club.amenityIds.map((id) => (
                <Badge key={`amenity-${id}`} tone="teal">
                  {amenityNameById[id] ?? `#${id}`}
                </Badge>
              ))}
            </div>
          </Card>

          {/* Галерея — на мобильном снизу (компактнее), на xl слева */}
          <Card className="overflow-hidden p-4 xl:order-first sm:p-5">
            {hasMediaGallery ? (
              <div className="grid gap-4" data-testid="club-media-gallery">
                <MediaStub label="Фото клуба" className="min-h-48 md:min-h-72 xl:min-h-[26rem]" />
                <div
                  className="grid gap-4 sm:grid-cols-2"
                  data-testid="club-media-gallery-secondary"
                >
                  <MediaStub label="Фото клуба" className="min-h-32 sm:min-h-40 xl:min-h-48" />
                  <MediaStub label="Фото клуба" className="min-h-32 sm:min-h-40 xl:min-h-48" />
                </div>
              </div>
            ) : (
              <div className="space-y-4" data-testid="club-media-empty">
                <MediaStub label="Фото клуба" className="min-h-48 md:min-h-72 xl:min-h-[26rem]" />
                <p className="text-sm leading-relaxed text-muted">
                  Галерея пока не добавлена. Публикация остаётся рабочей и откроется в каталоге даже
                  с минимальным набором данных.
                </p>
              </div>
            )}
          </Card>
        </section>

        <section data-testid="club-directions-section">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                Sport focus
              </p>
              <h2 className="mt-2 font-display text-3xl font-semibold text-ink">
                Направления клуба
              </h2>
            </div>
            <Badge tone="outline">{sports.length} направления</Badge>
          </div>

          {sports.length > 0 ? (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {sports.map((sport) => (
                <div
                  key={sport.id}
                  className="flex h-full items-start gap-4 rounded-card border border-line bg-canvas px-5 py-5"
                >
                  <span className="mt-1 text-2xl" aria-hidden="true">
                    {sport.icon}
                  </span>
                  <div>
                    <p className="text-lg font-semibold text-ink">{sport.name}</p>
                    <p className="mt-2 text-sm leading-relaxed text-muted">{sport.description}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-6">
              <SectionEmptyState testId="club-directions-empty">
                Направления для этого клуба ещё не заполнены. Они появятся после обновления
                публикации.
              </SectionEmptyState>
            </div>
          )}
        </section>

        <section data-testid="club-trainers-section">
          <Card className="p-6 sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                  Coaching team
                </p>
                <h2 className="mt-2 font-display text-3xl font-semibold text-ink">Тренеры клуба</h2>
              </div>
              <Badge tone="outline">{trainers.length} тренера</Badge>
            </div>
            {trainers.length > 0 ? (
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {trainers.map((trainer) => (
                  <div
                    key={trainer.id}
                    data-testid={`club-trainer-card-${trainer.id}`}
                    className="flex h-full flex-col rounded-card border border-line bg-canvas p-4"
                  >
                    <MediaStub label="Фото тренера" className="min-h-44 w-full" />
                    <div className="mt-4">
                      <Link
                        href={`/trainers/${trainer.slug}`}
                        className="text-lg font-semibold text-ink transition-colors duration-200 hover:text-accent-strong"
                      >
                        {trainer.name}
                      </Link>
                      <p className="mt-2 text-sm leading-relaxed text-muted">{trainer.bio}</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Badge tone="outline">{trainer.experienceYears} лет опыта</Badge>
                        <Badge tone="outline">{trainer.reviewCount} отзывов</Badge>
                        <Badge tone="teal">{formatPrice(trainer.priceFrom)}</Badge>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {trainer.specialtyIds.map((id) => (
                          <Badge key={id} tone="outline">
                            {specialtyNameById[id] ?? `#${id}`}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-6">
                <SectionEmptyState testId="club-trainers-empty">
                  У клуба пока нет привязанных тренеров. Страница остаётся доступной и без команды,
                  пока публикация только начинает собираться.
                </SectionEmptyState>
              </div>
            )}
          </Card>
        </section>

        <section>
          <Card className="p-6 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                  Weekly schedule
                </p>
                <h2 className="mt-2 font-display text-3xl font-semibold text-ink">
                  Расписание на неделю
                </h2>
              </div>
              <Badge tone="outline">{schedule.length} слотов</Badge>
            </div>
            {scheduleGroups.length > 0 ? (
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
                              <p className="text-sm font-semibold uppercase tracking-[0.10em] text-muted">
                                {slot.sportName}
                              </p>
                              <p className="mt-2 text-xl font-semibold text-ink">{slot.title}</p>
                              <p className="mt-2 text-sm leading-relaxed text-muted">
                                {slot.startTime} - {slot.endTime}, {slot.trainerName}
                              </p>
                            </div>

                            {isAthlete ? (
                              <Link
                                href={`/booking/${slot.id}`}
                                aria-label={`Записаться на ${slot.title}`}
                                className="inline-flex min-h-12 items-center justify-center rounded-pill bg-accent px-5 text-sm font-semibold text-panel transition-transform duration-200 hover:-translate-y-0.5"
                              >
                                Записаться
                              </Link>
                            ) : (
                              <Button
                                aria-label={`Записаться на ${slot.title}`}
                                onClick={() => {
                                  showActionNotice(
                                    'Чтобы записаться, войдите или зарегистрируйтесь как спортсмен',
                                  );
                                }}
                              >
                                Записаться
                              </Button>
                            )}
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
            ) : (
              <div className="mt-6">
                <SectionEmptyState testId="club-schedule-empty">
                  В расписании клуба пока нет открытых слотов. Когда провайдер добавит занятия, они
                  появятся здесь без отдельной ручной настройки.
                </SectionEmptyState>
              </div>
            )}
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
          <Card className="p-6 sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                  Community feedback
                </p>
                <h2 className="mt-2 font-display text-3xl font-semibold text-ink">Отзывы клуба</h2>
              </div>
              <Badge tone="outline">{reviewItems.length} отзывов</Badge>
            </div>
            {reviewItems.length > 0 ? (
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
                        <p className="mt-3 text-sm leading-relaxed text-muted">{review.text}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-6">
                <SectionEmptyState testId="club-reviews-empty">
                  У клуба пока нет отзывов. Первая оценка появится после первых посещений и
                  подтверждённых тренировок.
                </SectionEmptyState>
              </div>
            )}
          </Card>

          <Card className="p-6 sm:p-7">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                Share feedback
              </p>
              <h2 className="mt-2 font-display text-3xl font-semibold text-ink">Оставить отзыв</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                Отзыв может оставить только авторизованный спортсмен после реального взаимодействия
                с площадкой.
              </p>
            </div>

            <form className="mt-6 space-y-5" onSubmit={handleReviewSubmit}>
              <div className="space-y-2">
                <p className="text-sm font-semibold text-ink">Оценка</p>
                <Rating
                  interactive
                  value={reviewForm.rating}
                  onChange={(value) => {
                    setReviewForm((currentValue) => ({
                      ...currentValue,
                      rating: value,
                    }));
                    setReviewErrors((currentValue) => ({
                      ...currentValue,
                      rating: undefined,
                    }));
                  }}
                />
                {reviewErrors.rating ? (
                  <p className="text-sm font-medium text-danger">{reviewErrors.rating}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <label htmlFor="club-review-text" className="text-sm font-semibold text-ink">
                  Отзыв
                </label>
                <textarea
                  id="club-review-text"
                  value={reviewForm.text}
                  rows={5}
                  className="min-h-36 w-full rounded-card border border-line bg-canvas px-4 py-3 text-sm leading-relaxed text-ink outline-none transition-all focus:border-accent focus:ring-4 focus:ring-accent/15"
                  placeholder="Что понравилось в клубе, формате тренировок или атмосфере?"
                  onChange={(event) => {
                    setReviewForm((currentValue) => ({
                      ...currentValue,
                      text: event.target.value,
                    }));
                    setReviewErrors((currentValue) => ({
                      ...currentValue,
                      text: undefined,
                      submit: undefined,
                    }));
                  }}
                />
                {reviewErrors.text ? (
                  <p className="text-sm font-medium text-danger">{reviewErrors.text}</p>
                ) : null}
              </div>

              {reviewErrors.submit ? (
                <p className="text-sm font-medium text-danger">{reviewErrors.submit}</p>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-muted">
                  {isAthlete
                    ? `Отзыв будет отправлен как ${sessionUser?.name ?? 'Спортсмен SportHub'}.`
                    : 'Для отправки отзыва нужен вход или регистрация как спортсмен.'}
                </div>
                <Button type="submit" loading={isSubmittingReview}>
                  Отправить отзыв
                </Button>
              </div>
            </form>
          </Card>
        </section>
      </div>

      {notice ? <ActionNotice message={notice} /> : null}
    </div>
  );
}
