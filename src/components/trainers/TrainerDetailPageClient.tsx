'use client';

/* Клиентский компонент детальной страницы тренера /trainers/[slug] */

import Link from 'next/link';
import { type ReactNode, useMemo, useState } from 'react';
import { z } from 'zod';

import { Badge, Button, Card, Rating } from '@/components/ui';
import { getCoverPalette, getTrainerInitials } from '@/components/trainers/trainer-utils';
import { formatCityDisplay, formatDate, formatPhone, formatPrice } from '@/lib/utils';
import { selectAthleteActionUserId, useAuthStore } from '@/stores/useAuthStore';
import { useToastStore } from '@/stores/useToastStore';
import type { Club, Offering, Review, Schedule, Specialty, Sport, Trainer } from '@/types';

/* Отзыв с именем автора */
type ReviewWithAuthor = Review & {
  authorName: string;
};

/* Состояние формы отзыва */
type ReviewFormState = {
  rating: number;
  text: string;
};

/* Ошибки валидации формы отзыва */
type ReviewFormErrors = {
  rating?: string;
  text?: string;
  submit?: string;
};

/* Zod-схема валидации формы отзыва */
const reviewFormSchema = z.object({
  rating: z.number().int().min(1, 'Выбери оценку.'),
  text: z.string().trim().min(1, 'Напиши пару слов о впечатлении.'),
});

/* Обогащение отзывов именами авторов */
function mapReviewsWithAuthors(
  reviews: Review[],
  reviewAuthors: Record<number, string>,
): ReviewWithAuthor[] {
  return reviews.map((review) => ({
    ...review,
    authorName: reviewAuthors[review.userId] ?? 'Спортсмен SportHub',
  }));
}

/* Валидация формы отзыва */
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

type TrainerDetailPageClientProps = {
  affiliatedClub: Club | null;
  offerings: Offering[];
  reviewAuthors: Record<number, string>;
  reviews: Review[];
  schedule: Schedule[];
  specialties: Specialty[];
  sports: Sport[];
  trainer: Trainer;
};

/* Enriched-тип для слота расписания */
type EnrichedScheduleItem = Schedule & {
  sportName: string;
  availableSpots: number;
};

/* Группа слотов по дню */
type ScheduleGroup = {
  date: string;
  label: string;
  items: EnrichedScheduleItem[];
};

/* Форматирование метки дня: «Понедельник, 18 марта» */
function formatDayLabel(date: string) {
  const label = formatDate(date, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return label ? `${label.charAt(0).toUpperCase()}${label.slice(1)}` : date;
}

/* Группировка расписания по дате */
function buildScheduleGroups(schedule: Schedule[], sports: Sport[]): ScheduleGroup[] {
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

/* Метка формата услуги */
function getFormatLabel(format: Offering['format']): string {
  switch (format) {
    case 'personal': {
      return 'Персонально';
    }
    case 'mini_group': {
      return 'Мини-группа';
    }
    case 'group': {
      return 'Группа';
    }
    default: {
      return format;
    }
  }
}

/* Заглушка для медиа-контента (фото) */
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

export function TrainerDetailPageClient({
  affiliatedClub,
  offerings,
  reviewAuthors,
  reviews,
  schedule,
  specialties,
  sports,
  trainer,
}: TrainerDetailPageClientProps) {
  const accountType = useAuthStore((state) => state.accountType);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const sessionUser = useAuthStore((state) => state.user);
  const athleteActionUserId = useAuthStore(selectAthleteActionUserId);
  const addToast = useToastStore((state) => state.addToast);
  const [reviewItems, setReviewItems] = useState<ReviewWithAuthor[]>(() =>
    mapReviewsWithAuthors(reviews, reviewAuthors),
  );
  const [reviewForm, setReviewForm] = useState<ReviewFormState>({ rating: 0, text: '' });
  const [reviewErrors, setReviewErrors] = useState<ReviewFormErrors>({});
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const scheduleGroups = useMemo(() => buildScheduleGroups(schedule, sports), [schedule, sports]);
  /* Словарь specialtyId → name для отображения */
  const specialtyNameById = useMemo(
    () => Object.fromEntries(specialties.map((s) => [s.id, s.name])),
    [specialties],
  );
  const isAthlete = isAuthenticated && accountType === 'athlete' && athleteActionUserId !== null;

  function showActionNotice(message: string, tone: 'info' | 'success' | 'error' = 'info') {
    addToast({ message, tone });
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: athleteActionUserId,
          trainerId: trainer.id,
          rating: normalizedReviewForm.rating,
          text: normalizedReviewForm.text,
        }),
      });
      const payload = (await response.json()) as
        | { success: true; data: Review }
        | { success: false; error?: string };

      if (!response.ok || !payload.success) {
        setReviewErrors({ submit: 'Не удалось отправить отзыв.' });
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
      setReviewForm({ rating: 0, text: '' });
      setReviewErrors({});
      showActionNotice('Отзыв отправлен.', 'success');
    } catch (error) {
      console.error('Ошибка отправки отзыва со страницы тренера:', error);
      setReviewErrors({ submit: 'Не удалось отправить отзыв.' });
    } finally {
      setIsSubmittingReview(false);
    }
  }

  return (
    <div className="min-h-screen px-6 py-8 sm:px-8 lg:px-12">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        {/* ═══ Hero + Info ═══ */}
        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          {/* Инфо тренера — на мобильном сверху, на xl справа */}
          <Card className="flex h-full min-w-0 flex-col gap-5 overflow-hidden p-6 xl:order-last sm:p-7">
            <div className="flex flex-wrap gap-2">
              {trainer.city ? <Badge tone="accent">{formatCityDisplay(trainer.city)}</Badge> : null}
              <Badge tone="outline">{trainer.experienceYears} лет опыта</Badge>
              <Badge tone="outline">{trainer.reviewCount} отзывов</Badge>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                Trainer profile
              </p>
              <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
                {trainer.name}
              </h1>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Rating value={trainer.rating} />
                {trainer.address ? (
                  <span className="text-sm text-muted">{trainer.address}</span>
                ) : null}
              </div>
            </div>

            <p className="break-words text-base leading-relaxed text-muted">{trainer.bio}</p>

            <div className="grid gap-4 rounded-card border border-line bg-canvas p-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                  Цена от
                </p>
                <p className="mt-3 text-2xl font-semibold text-ink">
                  {formatPrice(trainer.priceFrom)}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                  Услуг
                </p>
                <p className="mt-3 text-2xl font-semibold text-ink">{offerings.length}</p>
              </div>
            </div>

            {/* Блок контактов тренера (Step 23.10) */}
            {(trainer.phone || trainer.vk || trainer.telegram || trainer.facebook) && (
              <div className="rounded-card border border-line bg-canvas p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                  Контакты
                </p>
                <div className="mt-3 space-y-2 text-sm leading-relaxed text-ink">
                  {trainer.phone ? <p>{formatPhone(trainer.phone)}</p> : null}
                  {trainer.vk ? (
                    <a
                      href={trainer.vk}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-accent-strong hover:underline"
                    >
                      VK
                    </a>
                  ) : null}
                  {trainer.telegram ? (
                    <a
                      href={trainer.telegram}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-accent-strong hover:underline"
                    >
                      Telegram
                    </a>
                  ) : null}
                  {trainer.facebook ? (
                    <a
                      href={trainer.facebook}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-accent-strong hover:underline"
                    >
                      Facebook
                    </a>
                  ) : null}
                </div>
              </div>
            )}
          </Card>

          {/* Hero — gradient cover с инициалами */}
          <Card className="overflow-hidden p-0 xl:order-first">
            <div
              className={`relative flex min-h-72 flex-col justify-between overflow-hidden bg-gradient-to-br ${getCoverPalette(trainer.id)} p-6 text-panel sm:min-h-80 xl:min-h-[26rem] sm:p-8`}
            >
              {/* Фото-заглушка */}
              <div className="flex justify-end">
                <div className="relative flex size-36 shrink-0 items-center justify-center rounded-[1.5rem] border border-panel/24 bg-panel/18 backdrop-blur-sm sm:size-40">
                  <div className="absolute top-5 size-16 rounded-full bg-panel/88" />
                  <div className="absolute bottom-5 h-20 w-20 rounded-t-[999px] bg-panel/82" />
                  <span className="absolute bottom-3 rounded-pill bg-panel px-3 py-0.5 text-[10px] font-semibold uppercase tracking-[0.10em] text-accent-strong">
                    Фото
                  </span>
                  <span className="absolute left-3 top-3 text-sm font-semibold uppercase tracking-[0.10em] text-panel/70">
                    {getTrainerInitials(trainer.name)}
                  </span>
                </div>
              </div>

              <div className="mt-auto">
                <p className="text-xs font-semibold uppercase tracking-[0.10em] text-panel/72">
                  Персональный тренер
                </p>
                <p className="mt-3 max-w-md font-display text-3xl font-semibold leading-tight sm:text-4xl">
                  {trainer.name}
                </p>
                <div className="mt-4 flex flex-wrap gap-2 text-2xl" aria-hidden="true">
                  {sports.map((sport) => (
                    <span key={sport.id}>{sport.icon}</span>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </section>

        {/* ═══ Специализации и виды спорта ═══ */}
        <section data-testid="trainer-specializations-section">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                Expertise
              </p>
              <h2 className="mt-2 font-display text-3xl font-semibold text-ink">Специализации</h2>
            </div>
            <Badge tone="outline">{trainer.specialtyIds.length + sports.length} направлений</Badge>
          </div>

          {sports.length > 0 || trainer.specialtyIds.length > 0 ? (
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
              {trainer.specialtyIds.map((id) => (
                <div
                  key={id}
                  className="flex h-full items-start gap-4 rounded-card border border-line bg-canvas px-5 py-5"
                >
                  <span className="mt-1 text-2xl" aria-hidden="true">
                    🎯
                  </span>
                  <div>
                    <p className="text-lg font-semibold text-ink">
                      {specialtyNameById[id] ?? `#${id}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-6">
              <SectionEmptyState testId="trainer-specializations-empty">
                Направления и специализации пока не заполнены. Профиль остаётся доступным даже до
                расширения описания.
              </SectionEmptyState>
            </div>
          )}
        </section>

        {/* ═══ Связанный клуб ═══ */}
        {affiliatedClub ? (
          <section data-testid="trainer-affiliated-club-section">
            <Card className="p-6 sm:p-7">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                  Works at
                </p>
                <h2 className="mt-2 font-display text-3xl font-semibold text-ink">Работает в</h2>
              </div>

              <div className="mt-6 flex flex-col gap-4 rounded-card border border-line bg-canvas p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-4">
                  <MediaStub label="Фото клуба" className="min-h-20 min-w-20" />
                  <div>
                    <p className="text-lg font-semibold text-ink">{affiliatedClub.name}</p>
                    <p className="mt-1 text-sm text-muted">{affiliatedClub.address}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <Rating value={affiliatedClub.rating} />
                      <Badge tone="outline">{affiliatedClub.reviewCount} отзывов</Badge>
                    </div>
                  </div>
                </div>
                <Link
                  href={`/clubs/${affiliatedClub.slug}`}
                  className="inline-flex min-h-12 items-center justify-center rounded-pill bg-accent px-6 text-sm font-semibold text-panel transition-transform duration-200 hover:-translate-y-0.5"
                >
                  Перейти к клубу
                </Link>
              </div>
            </Card>
          </section>
        ) : null}

        {/* ═══ Услуги тренера ═══ */}
        <section data-testid="trainer-offerings-section">
          <Card className="p-6 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                  Services
                </p>
                <h2 className="mt-2 font-display text-3xl font-semibold text-ink">
                  Услуги тренера
                </h2>
              </div>
              <Badge tone="outline">{offerings.length} услуг</Badge>
            </div>
            {offerings.length > 0 ? (
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {offerings.map((offering) => (
                  <div
                    key={offering.id}
                    className="flex h-full flex-col rounded-card border border-line bg-canvas p-5"
                  >
                    <p className="text-lg font-semibold text-ink">{offering.title}</p>
                    <p className="mt-2 text-sm leading-relaxed text-muted">
                      {offering.description}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Badge tone="teal">{getFormatLabel(offering.format)}</Badge>
                      <Badge tone="outline">{formatPrice(offering.price)}</Badge>
                      <Badge tone="outline">{offering.durationMinutes} мин</Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-6">
                <SectionEmptyState testId="trainer-offerings-empty">
                  У тренера пока нет опубликованных услуг. Они появятся здесь сразу после добавления
                  из кабинета провайдера.
                </SectionEmptyState>
              </div>
            )}
          </Card>
        </section>

        {/* ═══ Расписание ═══ */}
        <section data-testid="trainer-schedule-section">
          <Card className="p-6 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                  Schedule
                </p>
                <h2 className="mt-2 font-display text-3xl font-semibold text-ink">Расписание</h2>
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
                                {slot.startTime} - {slot.endTime}
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
                <SectionEmptyState testId="trainer-schedule-empty">
                  У тренера пока нет открытых слотов. Когда провайдер добавит расписание, запись
                  станет доступна прямо из этой страницы.
                </SectionEmptyState>
              </div>
            )}
          </Card>
        </section>

        {/* ═══ Отзывы + Форма ═══ */}
        <section className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
          <Card className="p-6 sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                  Community feedback
                </p>
                <h2 className="mt-2 font-display text-3xl font-semibold text-ink">Отзывы</h2>
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
                <SectionEmptyState testId="trainer-reviews-empty">
                  У тренера пока нет отзывов. Первая обратная связь появится после первых
                  проведённых тренировок.
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
                Отзыв может оставить только авторизованный спортсмен.
              </p>
            </div>

            <form className="mt-6 space-y-5" onSubmit={handleReviewSubmit}>
              <div className="space-y-2">
                <p className="text-sm font-semibold text-ink">Оценка</p>
                <Rating
                  interactive
                  value={reviewForm.rating}
                  onChange={(value) => {
                    setReviewForm((currentValue) => ({ ...currentValue, rating: value }));
                    setReviewErrors((currentValue) => ({ ...currentValue, rating: undefined }));
                  }}
                />
                {reviewErrors.rating ? (
                  <p className="text-sm font-medium text-danger">{reviewErrors.rating}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <label htmlFor="trainer-review-text" className="text-sm font-semibold text-ink">
                  Отзыв
                </label>
                <textarea
                  id="trainer-review-text"
                  value={reviewForm.text}
                  rows={5}
                  className="min-h-36 w-full rounded-card border border-line bg-canvas px-4 py-3 text-sm leading-relaxed text-ink outline-none transition-all focus:border-accent focus:ring-4 focus:ring-accent/15"
                  placeholder="Что понравилось в тренировках, подходе или атмосфере?"
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

      {/* Toast-уведомления рендерятся глобально через ToastStack в AppShell (Step 24.6). */}
    </div>
  );
}
