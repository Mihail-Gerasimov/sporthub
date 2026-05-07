'use client';

/* TrainerDetailPageClient — детальная страница тренера `/trainers/[slug]`.
 * Phase 28.23: полная перевёрстка визуала под dark-палитру SportHub.
 *
 * Структура страницы (по порядку секций):
 *   1. Hero (2-col на lg+, 1-col иначе): placeholder с avatar-disc 132×132
 *      (инициалы Bowlby) + «Фото тренера» слева; meta-col справа
 *      (chips → eyebrow → name → rating + addr → описание → stat-rail
 *      Цена/Услуг → stat-rail Контакты → ChipMarquee специализаций → CTA).
 *   2. Reliability — секция с ReliabilityBadge showDetails (как было).
 *   3. Specializations — sport+specialty grid 2-col с orange-icon.
 *   4. Works at — works-card (placeholder thumb 64×64 + body + Link
 *      «Перейти к клубу» в стиле btn-primary). Скрывается без affiliatedClub.
 *   5. Services — список услуг с chips (format/price/duration/venue).
 *   6. Schedule — DetailScheduleWeek (week-tabs anchor today),
 *      sub = `${startTime} - ${endTime}` (room в отдельном chip — без дублирования).
 *   7. Reviews + Form — reviews-list + форма (zod + POST /api/reviews +
 *      auth-gating) — БЕЗ ИЗМЕНЕНИЙ.
 *
 * Логика отзыва, /booking/[id] href, ReliabilityBadge, getTrainerInitials —
 * без изменений. Расписание показывает только текущую ISO-неделю
 * (anchor today), переключение по day-tabs внутри DetailScheduleWeek.
 */

import Link from 'next/link';
import { type ReactNode, useMemo, useState } from 'react';
import { z } from 'zod';

import { Button, Rating, ReliabilityBadge } from '@/components/ui';
import { ChipMarquee } from '@/components/ui/ChipMarquee';
import { getTrainerInitials } from '@/components/trainers/trainer-utils';
import {
  DetailScheduleWeek,
  type DetailScheduleSlot,
} from '@/components/detail-shared/DetailScheduleWeek';
import { getCurrentWeekRange } from '@/components/detail-shared/utils';
import { formatCityDisplay, formatDate, formatPhone, formatPrice } from '@/lib/utils';
import type { ReliabilityResult } from '@/lib/reliability';
import { selectAthleteActionUserId, useAuthStore } from '@/stores/useAuthStore';
import { useToastStore } from '@/stores/useToastStore';
import type { Club, Offering, Review, Schedule, Specialty, Sport, Trainer } from '@/types';

type ReviewWithAuthor = Review & {
  authorName: string;
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

type TrainerDetailPageClientProps = {
  affiliatedClub: Club | null;
  offerings: Offering[];
  reviewAuthors: Record<number, string>;
  reviews: Review[];
  schedule: Schedule[];
  specialties: Specialty[];
  sports: Sport[];
  trainer: Trainer;
  /** Phase 25 Step 25.13: рейтинг надёжности тренера. Если передан — рендерится секция «Надёжность». */
  reliability?: ReliabilityResult;
};

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

/* Empty-state для секций. */
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

/* Склонение «N отзывов»: 1 отзыв / 2-4 отзыва / 5+ отзывов. */
function pluralizeReviews(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${count} отзывов`;
  if (last === 1) return `${count} отзыв`;
  if (last >= 2 && last <= 4) return `${count} отзыва`;
  return `${count} отзывов`;
}

/* Склонение «N услуг»: 1 услуга / 2-4 услуги / 5+ услуг. */
function pluralizeServices(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${count} услуг`;
  if (last === 1) return `${count} услуга`;
  if (last >= 2 && last <= 4) return `${count} услуги`;
  return `${count} услуг`;
}

/* Склонение «N направлений». */
function pluralizeDirections(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${count} направлений`;
  if (last === 1) return `${count} направление`;
  if (last >= 2 && last <= 4) return `${count} направления`;
  return `${count} направлений`;
}

/* Склонение «N слотов». */
function pluralizeSlots(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${count} слотов`;
  if (last === 1) return `${count} слот`;
  if (last >= 2 && last <= 4) return `${count} слота`;
  return `${count} слотов`;
}

/* Метка формата услуги. */
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

export function TrainerDetailPageClient({
  affiliatedClub,
  offerings,
  reviewAuthors,
  reviews,
  schedule,
  specialties,
  sports,
  trainer,
  reliability,
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

  /* Словарь specialtyId → name для отображения */
  const specialtyNameById = useMemo(
    () => Object.fromEntries(specialties.map((s) => [s.id, s.name])),
    [specialties],
  );

  /* Phase 28.23: фильтр слотов по текущей ISO-неделе + enrichment для
   * DetailScheduleWeek. На trainer-странице sub = `${time}, ${room}`
   * (тренер всегда тот же, поэтому имя в sub не нужно — указываем зал). */
  const weekSlots: DetailScheduleSlot[] = useMemo(() => {
    const { mondayIso, sundayIso } = getCurrentWeekRange();
    const sportNames = new Map(sports.map((s) => [s.id, s.name]));
    return schedule
      .filter((s) => s.date >= mondayIso && s.date <= sundayIso)
      .map(
        (slot) =>
          ({
            id: slot.id,
            date: slot.date,
            title: slot.title,
            sportName: sportNames.get(slot.sportId) ?? 'Занятие',
            priceLabel: formatPrice(slot.price),
            availableSpots: Math.max(slot.capacity - slot.bookedCount, 0),
            room: slot.room ?? null,
            // Phase 28.23 audit-fix: на trainer-странице room уже отдельным chip-ом,
            // в sub дублирующий зал не нужен — оставляем только время.
            sub: `${slot.startTime} - ${slot.endTime}`,
          }) satisfies DetailScheduleSlot,
      );
  }, [schedule, sports]);

  const isAthlete = isAuthenticated && accountType === 'athlete' && athleteActionUserId !== null;

  /* Сборка специализаций для AmenityRow в hero — sports + specialty имена. */
  const specializationItems = useMemo(() => {
    return [
      ...sports.map((s) => ({ label: s.name })),
      ...trainer.specialtyIds.map((id) => ({
        label: specialtyNameById[id] ?? `#${id}`,
      })),
    ];
  }, [sports, trainer.specialtyIds, specialtyNameById]);

  /* Список направлений для секции «Специализации». */
  const directions = useMemo(() => {
    return [
      ...sports.map((s) => ({
        key: `sport-${s.id}`,
        name: s.name,
        sub: s.description,
        kind: 'sport' as const,
      })),
      ...trainer.specialtyIds.map((id) => ({
        key: `spec-${id}`,
        name: specialtyNameById[id] ?? `#${id}`,
        sub: '',
        kind: 'specialty' as const,
      })),
    ];
  }, [sports, trainer.specialtyIds, specialtyNameById]);

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

  const phoneRaw = trainer.phone ? trainer.phone.replace(/\s+/g, '') : '';
  const trainerInitials = getTrainerInitials(trainer.name);

  return (
    <main className="min-h-screen overflow-x-hidden px-4 py-7 sm:px-6 md:px-8 lg:py-8 lg:px-10">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-6">
        {/* ═══ Hero — gallery (placeholder с avatar-disc) + meta-col. Hero —
         * просто grid без card-обёртки: card-стиль на gallery-блоке. ═══ */}
        <section className="grid grid-cols-1 gap-5 lg:grid-cols-[1.05fr_1fr] lg:gap-[22px]">
          {/* Photo-placeholder тренера: avatar-disc 132×132 (96 на 480) с инициалами. */}
          <div className="overflow-hidden rounded-[18px] border border-line bg-card-2">
            <div className="hero-bg-blank flex aspect-[16/10] flex-col items-center justify-center gap-3.5">
              <span
                aria-hidden="true"
                className="flex size-24 items-center justify-center rounded-full border border-line bg-card font-display text-[32px] tabular-nums text-ink md:size-[132px] md:text-[44px]"
              >
                {trainerInitials}
              </span>
              <span className="font-body text-[11px] font-bold uppercase tracking-[0.28em] text-muted">
                Фото тренера
              </span>
            </div>
          </div>

          {/* Meta column */}
          <div className="flex min-w-0 flex-col gap-4">
            {/* meta-tags */}
            <div className="flex flex-wrap gap-2">
              {trainer.city ? <Chip variant="solid">{formatCityDisplay(trainer.city)}</Chip> : null}
              <Chip>{trainer.experienceYears} лет опыта</Chip>
              <Chip>{pluralizeReviews(trainer.reviewCount)}</Chip>
            </div>

            <div className="flex flex-col gap-3">
              <p className="font-body text-[11px] font-bold uppercase tracking-[0.22em] text-muted">
                Trainer profile
              </p>
              <h1 className="font-display text-[24px] leading-none text-ink md:text-[30px] lg:text-[32px] xl:text-[38px]">
                {trainer.name}
              </h1>

              {/* rating + addr */}
              <div className="flex flex-wrap items-center gap-3">
                <Rating value={trainer.rating} hideValue />
                <span className="font-display text-sm tabular-nums text-ink">
                  {trainer.rating.toFixed(1)}
                </span>
                {trainer.address ? (
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
                    {trainer.address}
                  </span>
                ) : null}
              </div>
            </div>

            {/* description (line-clamp-5) */}
            <p className="line-clamp-5 break-words font-body text-sm leading-relaxed text-muted">
              {trainer.bio}
            </p>

            {/* stat-rail 2-col: Цена от | Услуг */}
            <div className="grid grid-cols-1 overflow-hidden rounded-[16px] border border-line bg-card-2 lg:grid-cols-[1.1fr_1fr]">
              <div className="border-b border-line px-[18px] py-4 lg:border-b-0 lg:border-r">
                <p className="font-body text-[10px] font-bold uppercase tracking-[0.22em] text-muted">
                  Цена от
                </p>
                <p className="mt-2 font-display text-[18px] leading-none text-ink md:text-[22px]">
                  {formatPrice(trainer.priceFrom)}
                </p>
                <p className="mt-1.5 font-body text-xs font-medium leading-snug text-muted">
                  за тренировку
                </p>
              </div>
              <div className="px-[18px] py-4">
                <p className="font-body text-[10px] font-bold uppercase tracking-[0.22em] text-muted">
                  Услуг
                </p>
                <p className="mt-2 font-display text-[18px] leading-none text-ink tabular-nums md:text-[22px]">
                  {offerings.length}
                </p>
                <p className="mt-1.5 font-body text-xs font-medium leading-snug text-muted">
                  в активном прайсе
                </p>
              </div>
            </div>

            {/* stat-rail 1-col: Контакты (если есть) */}
            {trainer.phone || trainer.vk || trainer.telegram || trainer.facebook ? (
              <div className="rounded-[16px] border border-line bg-card-2 px-[18px] py-4">
                <p className="font-body text-[10px] font-bold uppercase tracking-[0.22em] text-muted">
                  Контакты
                </p>
                <div className="mt-2 space-y-1 text-sm">
                  {trainer.phone ? (
                    <p className="font-body font-semibold text-ink">{formatPhone(trainer.phone)}</p>
                  ) : null}
                  {trainer.vk ? (
                    <a
                      href={trainer.vk}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block font-body text-muted hover:text-lime"
                    >
                      VK
                    </a>
                  ) : null}
                  {trainer.telegram ? (
                    <a
                      href={trainer.telegram}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block font-body text-muted hover:text-lime"
                    >
                      Telegram
                    </a>
                  ) : null}
                  {trainer.facebook ? (
                    <a
                      href={trainer.facebook}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block font-body text-muted hover:text-lime"
                    >
                      Facebook
                    </a>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* amenity-row через ChipMarquee — специализации */}
            {specializationItems.length > 0 ? (
              <ChipMarquee items={specializationItems} variant="outline" accent="lime" />
            ) : null}

            {/* CTA-row */}
            <div className="flex flex-wrap items-center gap-2.5">
              <a
                href="#trainer-schedule"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-pill bg-lime px-[18px] font-body text-xs font-bold uppercase tracking-[0.14em] text-bg transition-colors hover:bg-lime-hov"
              >
                Записаться к тренеру <span aria-hidden="true">→</span>
              </a>
              {phoneRaw ? (
                <a
                  href={`tel:${phoneRaw}`}
                  className="inline-flex min-h-11 items-center justify-center rounded-pill border border-line bg-transparent px-[18px] font-body text-xs font-bold uppercase tracking-[0.14em] text-ink transition-colors hover:border-lime hover:text-lime"
                >
                  Связаться
                </a>
              ) : null}
            </div>
          </div>
        </section>

        {/* ═══ Reliability ═══ */}
        {reliability ? (
          <section
            data-testid="trainer-reliability-section"
            className="rounded-[18px] border border-line bg-card p-5 sm:p-6"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1.5">
                <p className="font-body text-[11px] font-bold uppercase tracking-[0.22em] text-muted">
                  Reliability
                </p>
                <h2 className="font-display text-[22px] text-ink md:text-[26px]">Надёжность</h2>
                <p className="mt-2 max-w-prose font-body text-sm leading-relaxed text-muted">
                  Рейтинг считается по фактическим записям клиентов: completed vs no_show. Помогает
                  выбрать партнёра осознанно.
                </p>
              </div>
              <ReliabilityBadge reliability={reliability} showDetails />
            </div>
          </section>
        ) : null}

        {/* ═══ Specializations ═══ */}
        <section
          data-testid="trainer-specializations-section"
          className="rounded-[18px] border border-line bg-card p-5 sm:p-6"
        >
          <SecHead
            eyebrow="Expertise"
            title="Специализации"
            pill={directions.length > 0 ? pluralizeDirections(directions.length) : undefined}
          />
          {directions.length > 0 ? (
            <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
              {directions.map((d) => (
                <div
                  key={d.key}
                  className="grid grid-cols-[40px_1fr] items-center gap-3.5 rounded-[14px] border border-line bg-card-2 px-4 py-3.5 transition-colors hover:border-lime"
                >
                  <span
                    aria-hidden="true"
                    className={`flex size-10 items-center justify-center rounded-[12px] border border-line bg-card ${
                      d.kind === 'sport' ? 'text-lime' : 'text-orange'
                    }`}
                  >
                    {d.kind === 'sport' ? (
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="size-5"
                      >
                        <path d="M6 6v12M3 9v6M18 6v12M21 9v6M6 12h12" />
                      </svg>
                    ) : (
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="size-5"
                      >
                        <circle cx="12" cy="12" r="9" />
                        <circle cx="12" cy="12" r="5" />
                        <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                      </svg>
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="font-display text-[15px] leading-none text-ink">{d.name}</p>
                    {d.sub ? (
                      <p className="mt-1 font-body text-xs font-normal leading-snug text-muted">
                        {d.sub}
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <SectionEmptyState testId="trainer-specializations-empty">
              Направления и специализации пока не заполнены. Профиль остаётся доступным даже до
              расширения описания.
            </SectionEmptyState>
          )}
        </section>

        {/* ═══ Works at — Связанный клуб ═══ */}
        {affiliatedClub ? (
          <section
            data-testid="trainer-affiliated-club-section"
            className="rounded-[18px] border border-line bg-card p-5 sm:p-6"
          >
            <SecHead eyebrow="Works at" title="Работает в" />
            <div className="grid grid-cols-[56px_1fr] items-center gap-3.5 rounded-[14px] border border-line bg-card-2 px-4 py-3.5 md:grid-cols-[64px_1fr_auto]">
              {/* works-thumb (placeholder) */}
              <div className="flex size-14 items-center justify-center rounded-[12px] border border-line bg-card text-center font-body text-[9px] font-bold uppercase leading-tight tracking-[0.18em] text-disabled md:size-16">
                Фото
                <br />
                клуба
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <h3 className="font-display text-base leading-tight text-ink">
                  {affiliatedClub.name}
                </h3>
                <p className="font-body text-xs font-medium text-muted">{affiliatedClub.address}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-2.5">
                  <Rating value={affiliatedClub.rating} hideValue />
                  <span className="font-display text-sm tabular-nums text-ink">
                    {affiliatedClub.rating.toFixed(1)}
                  </span>
                  <Chip>{pluralizeReviews(affiliatedClub.reviewCount)}</Chip>
                </div>
              </div>
              <Link
                href={`/clubs/${affiliatedClub.slug}`}
                className="col-span-2 inline-flex min-h-11 items-center justify-center rounded-pill bg-lime px-[18px] font-body text-xs font-bold uppercase tracking-[0.14em] text-bg transition-colors hover:bg-lime-hov md:col-span-1"
              >
                Перейти к клубу
              </Link>
            </div>
          </section>
        ) : null}

        {/* ═══ Services — Услуги тренера ═══ */}
        <section
          data-testid="trainer-offerings-section"
          className="rounded-[18px] border border-line bg-card p-5 sm:p-6"
        >
          <SecHead
            eyebrow="Services"
            title="Услуги тренера"
            pill={offerings.length > 0 ? pluralizeServices(offerings.length) : undefined}
          />
          {offerings.length > 0 ? (
            <div className="flex flex-col gap-2.5">
              {offerings.map((offering) => (
                <div
                  key={offering.id}
                  className="flex flex-col gap-2.5 rounded-[14px] border border-line bg-card-2 px-4 py-3.5 transition-colors hover:border-lime"
                >
                  <h4 className="font-display text-[15px] leading-tight text-ink">
                    {offering.title}
                  </h4>
                  <p className="line-clamp-3 break-words font-body text-xs leading-relaxed text-muted">
                    {offering.description}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center rounded-pill border border-[rgba(132,192,3,0.28)] bg-lime-soft px-2.5 py-1 font-body text-[10px] font-bold uppercase tracking-[0.10em] text-lime">
                      {getFormatLabel(offering.format)}
                    </span>
                    <span className="inline-flex items-center rounded-pill border border-line bg-transparent px-2.5 py-1 font-body text-[10px] font-bold uppercase tracking-[0.10em] text-ink">
                      {formatPrice(offering.price)}
                    </span>
                    <span className="inline-flex items-center rounded-pill border border-line bg-transparent px-2.5 py-1 font-body text-[10px] font-bold uppercase tracking-[0.10em] text-ink">
                      {offering.durationMinutes} мин
                    </span>
                    {/* Phase 24 Step 24.11: venue-бейдж per offering — «в клубе X» или «Частно». */}
                    {offering.trainerClubLinkId !== undefined && affiliatedClub ? (
                      <span className="inline-flex items-center rounded-pill border border-line bg-transparent px-2.5 py-1 font-body text-[10px] font-bold uppercase tracking-[0.10em] text-ink">
                        В клубе «{affiliatedClub.name}»
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-pill border border-line bg-transparent px-2.5 py-1 font-body text-[10px] font-bold uppercase tracking-[0.10em] text-ink">
                        Частно
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <SectionEmptyState testId="trainer-offerings-empty">
              У тренера пока нет опубликованных услуг. Они появятся здесь сразу после добавления из
              кабинета провайдера.
            </SectionEmptyState>
          )}
        </section>

        {/* ═══ Schedule — Расписание ═══ */}
        <section
          id="trainer-schedule"
          data-testid="trainer-schedule-section"
          className="rounded-[18px] border border-line bg-card p-5 sm:p-6"
        >
          <SecHead
            eyebrow="Schedule"
            title="Расписание"
            pill={weekSlots.length > 0 ? pluralizeSlots(weekSlots.length) : undefined}
          />
          {weekSlots.length > 0 ? (
            <DetailScheduleWeek
              slots={weekSlots}
              isAthlete={isAthlete}
              onGuestSlotAction={handleGuestSlotAction}
            />
          ) : (
            <SectionEmptyState testId="trainer-schedule-empty">
              У тренера пока нет открытых слотов на текущей неделе. Когда провайдер добавит
              расписание, запись станет доступна прямо из этой страницы.
            </SectionEmptyState>
          )}
        </section>

        {/* ═══ Reviews + Form ═══ */}
        <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.2fr_1fr]">
          {/* Reviews list */}
          <div className="rounded-[18px] border border-line bg-card p-5 sm:p-6">
            <SecHead
              eyebrow="Community feedback"
              title="Отзывы"
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
              <SectionEmptyState testId="trainer-reviews-empty">
                У тренера пока нет отзывов. Первая обратная связь появится после первых проведённых
                тренировок.
              </SectionEmptyState>
            )}
          </div>

          {/* Form — zod + POST + auth-gating без изменений */}
          <div className="rounded-[18px] border border-line bg-card p-5 sm:p-6">
            <SecHead eyebrow="Share feedback" title="Оставить отзыв" />

            <div className="rounded-[18px] border border-line bg-card-2 p-[18px]">
              <p className="mb-3 font-body text-[13px] leading-relaxed text-muted">
                Отзыв может оставить только авторизованный спортсмен.
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
                    htmlFor="trainer-review-text"
                    className="font-body text-[10px] font-bold uppercase tracking-[0.22em] text-muted"
                  >
                    Отзыв
                  </label>
                  <textarea
                    id="trainer-review-text"
                    value={reviewForm.text}
                    rows={5}
                    className="min-h-28 w-full resize-y rounded-[12px] border border-line bg-bg px-3.5 py-3 font-body text-[13px] leading-relaxed text-ink outline-none transition-colors focus:border-lime"
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
