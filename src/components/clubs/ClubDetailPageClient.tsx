'use client';

/* ClubDetailPageClient — детальная страница клуба `/clubs/[slug]`.
 * Phase 28.22: полная перевёрстка визуала под dark-палитру SportHub.
 *
 * Структура страницы (по порядку секций):
 *   1. Hero (1-col без gallery): meta-chips → eyebrow → name (Bowlby)
 *      → addr → rating → описание → stat-rail (Контакты / Цена от)
 *      → ChipMarquee (теги + удобства) → CTA-row.
 *   2. Reliability — секция с ReliabilityBadge showDetails (как было).
 *   3. Sport focus — направления клуба (icon + name + sub).
 *   4. Coaching team — coach-grid 2-col с watermark номера, Link на тренера.
 *   5. Weekly schedule — DetailScheduleWeek (week-tabs anchor today).
 *   6. Reviews + form — review-list (+ Rating справа) и форма отзыва
 *      (zod + POST /api/reviews + auth-gating — БЕЗ ИЗМЕНЕНИЙ).
 *
 * Логика отзыва, booking-href `/booking/[id]`, ReliabilityBadge — без
 * изменений. Изменилось расписание: показываем ТОЛЬКО слоты текущей
 * ISO-недели (anchor today), переключение по day-tabs внутри
 * DetailScheduleWeek.
 */

import Link from 'next/link';
import { type ReactNode, useMemo, useState } from 'react';
import { z } from 'zod';

import { Button, Rating, ReliabilityBadge } from '@/components/ui';
import { ChipMarquee } from '@/components/ui/ChipMarquee';
import {
  DetailScheduleWeek,
  type DetailScheduleSlot,
} from '@/components/detail-shared/DetailScheduleWeek';
import { getCurrentWeekRange } from '@/components/detail-shared/utils';
import type { ReliabilityResult } from '@/lib/reliability';
import { isSlotUpcoming } from '@/lib/slot-time';
import { useToastStore } from '@/stores/useToastStore';
import { formatCityDisplay, formatDate, formatPhone, formatPrice } from '@/lib/utils';
import { selectAthleteActionUserId, useAuthStore } from '@/stores/useAuthStore';
import type { Amenity, Club, Review, Schedule, Specialty, Sport, Tag, Trainer } from '@/types';

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
  /** Phase 25 Step 25.13: рейтинг надёжности клуба. Если передан — рендерится секция «Надёжность». */
  reliability?: ReliabilityResult;
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

const reviewFormSchema = z.object({
  rating: z.number().int().min(1, 'Выбери оценку.'),
  text: z.string().trim().min(1, 'Напиши пару слов о впечатлении.'),
});

/* Хелпер: солид-чип (lime-fill) или outline-чип (transparent + ink). */
function Chip({
  variant = 'outline',
  children,
}: {
  variant?: 'solid' | 'outline';
  children: ReactNode;
}) {
  const cls =
    variant === 'solid'
      ? 'border-[rgba(132,192,3,0.28)] bg-lime-soft text-lime'
      : 'border-line bg-transparent text-ink';
  return (
    <span
      className={`inline-flex items-center rounded-pill border px-3 py-1.5 font-body text-[11px] font-semibold uppercase tracking-[0.12em] ${cls}`}
    >
      {children}
    </span>
  );
}

/* Empty-state для секций (dashed-border, bg-card-2, муртед-текст). */
function SectionEmptyState({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <div
      data-testid={testId}
      className="rounded-[14px] border border-dashed border-line bg-card-2 px-5 py-5 text-sm leading-relaxed text-muted"
    >
      {children}
    </div>
  );
}

/* Sec-head: eyebrow + Bowlby title слева + sec-pill счётчик справа. */
function SecHead({ eyebrow, title, pill }: { eyebrow: string; title: string; pill?: string }) {
  return (
    <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="font-body text-[11px] font-bold uppercase tracking-[0.22em] text-muted">
          {eyebrow}
        </p>
        <h2 className="font-display text-[22px] text-ink md:text-[26px]">{title}</h2>
      </div>
      {pill ? (
        <span className="inline-flex shrink-0 items-center rounded-pill border border-line px-3 py-1.5 font-body text-[10px] font-bold uppercase tracking-[0.18em] text-ink">
          {pill}
        </span>
      ) : null}
    </header>
  );
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

/* Склонение «N тренеров»: 1 тренер / 2-4 тренера / 5+ тренеров. */
function pluralizeTrainers(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${count} тренеров`;
  if (last === 1) return `${count} тренер`;
  if (last >= 2 && last <= 4) return `${count} тренера`;
  return `${count} тренеров`;
}

/* Склонение «N направлений»: 1 направление / 2-4 направления / 5+ направлений. */
function pluralizeDirections(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${count} направлений`;
  if (last === 1) return `${count} направление`;
  if (last >= 2 && last <= 4) return `${count} направления`;
  return `${count} направлений`;
}

/* Склонение «N отзывов»: 1 отзыв / 2-4 отзыва / 5+ отзывов. */
function pluralizeReviews(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${count} отзывов`;
  if (last === 1) return `${count} отзыв`;
  if (last >= 2 && last <= 4) return `${count} отзыва`;
  return `${count} отзывов`;
}

/* Склонение «N слотов»: 1 слот / 2-4 слота / 5+ слотов. */
function pluralizeSlots(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${count} слотов`;
  if (last === 1) return `${count} слот`;
  if (last >= 2 && last <= 4) return `${count} слота`;
  return `${count} слотов`;
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
  reliability,
}: ClubDetailPageClientProps) {
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

  /* Phase 28.22: фильтр слотов по текущей ISO-неделе + enrichment (sportName,
   * trainerName, availableSpots, sub) для DetailScheduleWeek. Слоты вне
   * текущей недели не попадают сюда — старые исчезают, будущие появятся
   * когда соответствующая неделя станет текущей. */
  const weekSlots: DetailScheduleSlot[] = useMemo(() => {
    const { mondayIso, sundayIso } = getCurrentWeekRange();
    const trainerNames = new Map(trainers.map((t) => [t.id, t.name]));
    const sportNames = new Map(sports.map((s) => [s.id, s.name]));
    const now = new Date();
    return (
      schedule
        .filter((s) => s.date >= mondayIso && s.date <= sundayIso)
        // Phase 30.7: сегодняшние прошедшие слоты не показываем (TZ-safe сравнение).
        .filter((s) => isSlotUpcoming(s, now))
        .map((slot) => {
          const trainerName = trainerNames.get(slot.trainerId ?? -1) ?? 'Тренер SportHub';
          return {
            id: slot.id,
            date: slot.date,
            title: slot.title,
            sportName: sportNames.get(slot.sportId) ?? 'Занятие',
            priceLabel: formatPrice(slot.price),
            availableSpots: Math.max(slot.capacity - slot.bookedCount, 0),
            room: slot.room ?? null,
            sub: `${slot.startTime} - ${slot.endTime}, ${trainerName}`,
          } satisfies DetailScheduleSlot;
        })
    );
  }, [schedule, sports, trainers]);

  const isAthlete = isAuthenticated && accountType === 'athlete' && athleteActionUserId !== null;

  /* Объединённый список тегов и удобств для AmenityRow (через ChipMarquee). */
  const amenityItems = useMemo(() => {
    return [
      ...club.tagIds.map((id) => ({ label: tagNameById[id] ?? `#${id}` })),
      ...club.amenityIds.map((id) => ({ label: amenityNameById[id] ?? `#${id}` })),
    ];
  }, [club.tagIds, club.amenityIds, tagNameById, amenityNameById]);

  function showActionNotice(message: string, tone: 'info' | 'success' | 'error' = 'info') {
    addToast({ message, tone });
  }

  function handleGuestSlotAction() {
    showActionNotice('Чтобы записаться, войдите или зарегистрируйтесь как спортсмен');
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
          clubId: club.id,
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
      console.error('Ошибка отправки отзыва со страницы клуба:', error);
      setReviewErrors({ submit: 'Не удалось отправить отзыв.' });
    } finally {
      setIsSubmittingReview(false);
    }
  }

  const phoneRaw = club.phone ? club.phone.replace(/\s+/g, '') : '';

  return (
    <main className="min-h-screen overflow-x-hidden px-4 py-7 sm:px-6 md:px-8 lg:py-8 lg:px-10">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-6">
        {/* ═══ Hero — gallery (placeholder) + meta-col. Hero — просто grid
         * без card-обёртки: card-стиль живёт на gallery-блоке (handoff). ═══ */}
        <section className="grid grid-cols-1 gap-5 lg:grid-cols-[1.05fr_1fr] lg:gap-[22px]">
          {/* Photo-placeholder клуба (фотогалерея в MVP не подключена) */}
          <div className="overflow-hidden rounded-[18px] border border-line bg-card-2">
            <div className="hero-bg-blank flex aspect-[16/10] items-center justify-center">
              <span className="font-body text-[11px] font-bold uppercase tracking-[0.28em] text-muted">
                Фото клуба
              </span>
            </div>
          </div>

          {/* Meta column */}
          <div className="flex min-w-0 flex-col gap-4">
            {/* meta-tags */}
            <div className="flex flex-wrap gap-2">
              <Chip variant="solid">{formatCityDisplay(club.city)}</Chip>
              <Chip>{pluralizeReviews(club.reviewCount)}</Chip>
              <Chip>{club.distanceKm.toFixed(1)} км</Chip>
            </div>

            <div className="flex flex-col gap-3">
              <p className="font-body text-[11px] font-bold uppercase tracking-[0.22em] text-muted">
                Club profile
              </p>
              <h1 className="font-display text-[24px] leading-none text-ink md:text-[30px] lg:text-[32px] xl:text-[38px]">
                {club.name}
              </h1>

              {/* address с пином */}
              <span className="inline-flex items-center gap-1.5 font-body text-[13px] font-medium text-muted">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-3 shrink-0"
                  aria-hidden="true"
                >
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                {club.address}
              </span>

              {/* rating */}
              <div className="flex flex-wrap items-center gap-3">
                <Rating value={club.rating} hideValue />
                <span className="font-display text-sm tabular-nums text-ink">
                  {club.rating.toFixed(1)}
                </span>
              </div>
            </div>

            {/* description (line-clamp-5) */}
            <p className="line-clamp-5 break-words font-body text-sm leading-relaxed text-muted">
              {club.description}
            </p>

            {/* stat-rail: Контакты | Цена от */}
            <div className="grid grid-cols-1 overflow-hidden rounded-[16px] border border-line bg-card-2 lg:grid-cols-[1.1fr_1fr]">
              <div className="border-b border-line px-[18px] py-4 lg:border-b-0 lg:border-r">
                <p className="font-body text-[10px] font-bold uppercase tracking-[0.22em] text-muted">
                  Контакты
                </p>
                <div className="mt-2 space-y-1 text-sm">
                  {club.phone ? (
                    <p className="font-body font-semibold text-ink">{formatPhone(club.phone)}</p>
                  ) : null}
                  {club.email ? <p className="font-body text-muted">{club.email}</p> : null}
                  {club.website ? (
                    <a
                      href={club.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block font-body text-muted hover:text-lime"
                    >
                      Сайт
                    </a>
                  ) : null}
                  {club.vk ? (
                    <a
                      href={club.vk}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block font-body text-muted hover:text-lime"
                    >
                      VK
                    </a>
                  ) : null}
                  {club.telegram ? (
                    <a
                      href={club.telegram}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block font-body text-muted hover:text-lime"
                    >
                      Telegram
                    </a>
                  ) : null}
                  {club.facebook ? (
                    <a
                      href={club.facebook}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block font-body text-muted hover:text-lime"
                    >
                      Facebook
                    </a>
                  ) : null}
                </div>
              </div>
              <div className="px-[18px] py-4">
                <p className="font-body text-[10px] font-bold uppercase tracking-[0.22em] text-muted">
                  Цена от
                </p>
                <p className="mt-2 font-display text-[18px] leading-none text-ink md:text-[22px]">
                  {formatPrice(club.priceFrom)}
                </p>
                <p className="mt-1.5 font-body text-xs font-medium leading-snug text-muted">
                  за абонемент
                </p>
              </div>
            </div>

            {/* amenity-row через ChipMarquee */}
            {amenityItems.length > 0 ? (
              <ChipMarquee items={amenityItems} variant="outline" accent="lime" />
            ) : null}

            {/* CTA-row */}
            <div className="flex flex-wrap items-center gap-2.5">
              <a
                href="#club-schedule"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-pill bg-lime px-[18px] font-body text-xs font-bold uppercase tracking-[0.14em] text-ink transition-colors hover:bg-lime-hov"
              >
                Записаться на занятие <span aria-hidden="true">→</span>
              </a>
              {phoneRaw ? (
                <a
                  href={`tel:${phoneRaw}`}
                  className="inline-flex min-h-11 items-center justify-center rounded-pill border border-line bg-transparent px-[18px] font-body text-xs font-bold uppercase tracking-[0.14em] text-ink transition-colors hover:border-lime hover:text-lime"
                >
                  Связаться с клубом
                </a>
              ) : null}
            </div>
          </div>
        </section>

        {/* ═══ Reliability ═══ */}
        {reliability ? (
          <section
            data-testid="club-reliability-section"
            className="rounded-[18px] border border-line bg-card p-5 sm:p-6"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1.5">
                <p className="font-body text-[11px] font-bold uppercase tracking-[0.22em] text-muted">
                  Reliability
                </p>
                <h2 className="font-display text-[22px] text-ink md:text-[26px]">Надёжность</h2>
                <p className="mt-2 max-w-prose font-body text-sm leading-relaxed text-muted">
                  Рейтинг считается по фактическим записям: completed vs no_show. Помогает атлетам
                  выбрать клуб осознанно.
                </p>
              </div>
              <ReliabilityBadge reliability={reliability} showDetails />
            </div>
          </section>
        ) : null}

        {/* ═══ Sport focus — Направления клуба ═══ */}
        <section
          data-testid="club-directions-section"
          className="rounded-[18px] border border-line bg-card p-5 sm:p-6"
        >
          <SecHead
            eyebrow="Sport focus"
            title="Направления клуба"
            pill={sports.length > 0 ? pluralizeDirections(sports.length) : undefined}
          />
          {sports.length > 0 ? (
            <div className="flex flex-col gap-2.5">
              {sports.map((sport) => (
                <div
                  key={sport.id}
                  className="grid grid-cols-[40px_1fr] items-center gap-3.5 rounded-[14px] border border-line bg-card-2 px-4 py-3.5 transition-colors hover:border-lime"
                >
                  <span
                    aria-hidden="true"
                    className="flex size-10 items-center justify-center rounded-[12px] border border-line bg-card text-xl text-lime"
                  >
                    {sport.icon}
                  </span>
                  <div className="min-w-0">
                    <p className="font-display text-[15px] leading-none text-ink">{sport.name}</p>
                    <p className="mt-1 font-body text-xs font-normal leading-snug text-muted">
                      {sport.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <SectionEmptyState testId="club-directions-empty">
              Направления для этого клуба ещё не заполнены. Они появятся после обновления
              публикации.
            </SectionEmptyState>
          )}
        </section>

        {/* ═══ Coaching team — Тренеры клуба ═══ */}
        <section
          data-testid="club-trainers-section"
          className="rounded-[18px] border border-line bg-card p-5 sm:p-6"
        >
          <SecHead
            eyebrow="Coaching team"
            title="Тренеры клуба"
            pill={trainers.length > 0 ? pluralizeTrainers(trainers.length) : undefined}
          />
          {trainers.length > 0 ? (
            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
              {trainers.map((trainer, index) => (
                <article
                  key={trainer.id}
                  data-testid={`club-trainer-card-${trainer.id}`}
                  className="overflow-hidden rounded-[16px] border border-line bg-card-2 transition-colors hover:border-lime"
                >
                  {/* coach-photo + watermark номера ранга */}
                  <div className="hero-bg-orange relative aspect-[16/9] border-b border-line-2">
                    <span
                      aria-hidden="true"
                      className="absolute bottom-0 right-2.5 select-none font-display text-[80px] leading-[0.8] tabular-nums text-ink/[0.05]"
                    >
                      {String(index + 1).padStart(2, '0')}
                    </span>
                  </div>
                  <Link
                    href={`/trainers/${trainer.slug}`}
                    className="mx-4 mt-3.5 inline-block font-display text-base leading-none text-ink transition-colors hover:text-lime line-clamp-1"
                  >
                    {trainer.name}
                  </Link>
                  <p className="mx-4 mt-2 line-clamp-2 break-words font-body text-xs leading-relaxed text-muted">
                    {trainer.bio}
                  </p>
                  <div className="mx-4 mt-3 flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center rounded-pill border border-line bg-transparent px-2.5 py-1 font-body text-[10px] font-bold uppercase tracking-[0.10em] text-ink">
                      {trainer.experienceYears} лет опыта
                    </span>
                    <span className="inline-flex items-center rounded-pill border border-line bg-transparent px-2.5 py-1 font-body text-[10px] font-bold uppercase tracking-[0.10em] text-ink">
                      {pluralizeReviews(trainer.reviewCount)}
                    </span>
                    <span className="inline-flex items-center rounded-pill border border-[rgba(132,192,3,0.28)] bg-lime-soft px-2.5 py-1 font-body text-[10px] font-bold uppercase tracking-[0.10em] text-lime">
                      {formatPrice(trainer.priceFrom)}
                    </span>
                  </div>
                  <div className="mx-4 mb-4 mt-2 flex flex-wrap gap-1.5">
                    {trainer.specialtyIds.map((id) => (
                      <span
                        key={id}
                        className="inline-flex items-center rounded-pill border border-line bg-transparent px-2 py-1 font-body text-[9px] font-bold uppercase tracking-[0.10em] text-muted"
                      >
                        {specialtyNameById[id] ?? `#${id}`}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <SectionEmptyState testId="club-trainers-empty">
              У клуба пока нет привязанных тренеров. Страница остаётся доступной и без команды, пока
              публикация только начинает собираться.
            </SectionEmptyState>
          )}
        </section>

        {/* ═══ Weekly schedule — Расписание на неделю ═══ */}
        <section
          id="club-schedule"
          className="rounded-[18px] border border-line bg-card p-5 sm:p-6"
        >
          <SecHead
            eyebrow="Weekly schedule"
            title="Расписание на неделю"
            pill={weekSlots.length > 0 ? pluralizeSlots(weekSlots.length) : undefined}
          />
          {weekSlots.length > 0 ? (
            <DetailScheduleWeek
              slots={weekSlots}
              isAthlete={isAthlete}
              onGuestSlotAction={handleGuestSlotAction}
            />
          ) : (
            <SectionEmptyState testId="club-schedule-empty">
              В расписании клуба пока нет открытых слотов на текущей неделе. Когда провайдер добавит
              занятия, они появятся здесь без отдельной ручной настройки.
            </SectionEmptyState>
          )}
        </section>

        {/* ═══ Reviews + Form ═══ */}
        <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.2fr_1fr]">
          {/* Reviews list */}
          <div className="rounded-[18px] border border-line bg-card p-5 sm:p-6">
            <SecHead
              eyebrow="Community feedback"
              title="Отзывы клуба"
              pill={reviewItems.length > 0 ? pluralizeReviews(reviewItems.length) : undefined}
            />
            {reviewItems.length > 0 ? (
              <div className="flex flex-col gap-2.5">
                {reviewItems.map((review) => (
                  <div
                    key={review.id}
                    className="grid grid-cols-[36px_1fr] items-start gap-3 rounded-[14px] border border-line bg-card-2 px-3.5 py-3 md:grid-cols-[44px_1fr_auto] md:gap-3.5 md:px-4 md:py-3.5"
                  >
                    <div
                      aria-hidden="true"
                      className="size-9 rounded-[10px] border border-line bg-card-2 md:size-11 md:rounded-[12px]"
                      style={{
                        backgroundImage:
                          'repeating-linear-gradient(135deg, rgba(255,255,255,0.04) 0 1px, transparent 1px 8px)',
                      }}
                    />
                    <div className="min-w-0">
                      <p className="font-display text-sm leading-tight text-ink">
                        {review.authorName}
                      </p>
                      <p className="mt-0.5 font-body text-[11px] font-medium text-muted">
                        {formatDate(review.createdAt, { day: 'numeric', month: 'long' })}
                      </p>
                      <p className="mt-2 break-words font-body text-[13px] leading-relaxed text-ink">
                        {review.text}
                      </p>
                    </div>
                    <div className="col-span-2 flex items-center gap-2 md:col-auto">
                      <Rating value={review.rating} hideValue />
                      <span className="font-display text-sm tabular-nums text-ink">
                        {review.rating.toFixed(1)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <SectionEmptyState testId="club-reviews-empty">
                У клуба пока нет отзывов. Первая оценка появится после первых посещений и
                подтверждённых тренировок.
              </SectionEmptyState>
            )}
          </div>

          {/* Form — zod + POST + auth-gating без изменений */}
          <div className="rounded-[18px] border border-line bg-card p-5 sm:p-6">
            <SecHead eyebrow="Share feedback" title="Оставить отзыв" />

            <div className="rounded-[18px] border border-line bg-card-2 p-[18px]">
              <p className="mb-3 font-body text-[13px] leading-relaxed text-muted">
                Отзыв может оставить только авторизованный спортсмен после реального взаимодействия
                с площадкой.
              </p>
              <form className="flex flex-col gap-3.5" onSubmit={handleReviewSubmit}>
                <div className="flex flex-col gap-2">
                  <p className="font-body text-[10px] font-bold uppercase tracking-[0.22em] text-muted">
                    Оценка
                  </p>
                  <Rating
                    interactive
                    value={reviewForm.rating}
                    onChange={(value) => {
                      setReviewForm((currentValue) => ({ ...currentValue, rating: value }));
                      setReviewErrors((currentValue) => ({ ...currentValue, rating: undefined }));
                    }}
                  />
                  {reviewErrors.rating ? (
                    <p className="font-body text-sm font-medium text-red">{reviewErrors.rating}</p>
                  ) : null}
                </div>

                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="club-review-text"
                    className="font-body text-[10px] font-bold uppercase tracking-[0.22em] text-muted"
                  >
                    Отзыв
                  </label>
                  <textarea
                    id="club-review-text"
                    value={reviewForm.text}
                    rows={5}
                    className="min-h-28 w-full resize-y rounded-[12px] border border-line bg-bg px-3.5 py-3 font-body text-[13px] leading-relaxed text-ink outline-none transition-colors focus:border-lime"
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
                    <p className="font-body text-sm font-medium text-red">{reviewErrors.text}</p>
                  ) : null}
                </div>

                {reviewErrors.submit ? (
                  <p className="font-body text-sm font-medium text-red">{reviewErrors.submit}</p>
                ) : null}

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-body text-xs leading-relaxed text-muted">
                    {isAthlete
                      ? `Отзыв будет отправлен как ${sessionUser?.name ?? 'Спортсмен SportHub'}.`
                      : 'Для отправки нужен вход или регистрация как спортсмен.'}
                  </p>
                  <Button type="submit" aria-label="Отправить отзыв" loading={isSubmittingReview}>
                    Отправить отзыв
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </section>
      </div>

      {/* Toast-уведомления рендерятся глобально через ToastStack в AppShell (Step 24.6). */}
    </main>
  );
}
