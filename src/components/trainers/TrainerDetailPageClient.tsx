'use client';

/* Клиентский компонент детальной страницы тренера /trainers/[id] */

import Link from 'next/link';

import { Badge, Card, Rating } from '@/components/ui';
import { getCoverPalette, getTrainerInitials } from '@/components/trainers/trainer-utils';
import { formatPrice } from '@/lib/utils';
import type { Club, Offering, Review, Schedule, Sport, Trainer } from '@/types';

type TrainerDetailPageClientProps = {
  affiliatedClub: Club | null;
  offerings: Offering[];
  reviewAuthors: Record<number, string>;
  reviews: Review[];
  schedule: Schedule[];
  sports: Sport[];
  trainer: Trainer;
};

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

export function TrainerDetailPageClient({
  affiliatedClub,
  offerings,
  reviewAuthors,
  reviews,
  schedule,
  sports,
  trainer,
}: TrainerDetailPageClientProps) {
  return (
    <div className="min-h-screen px-6 py-8 sm:px-8 lg:px-12">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        {/* ═══ Hero + Info ═══ */}
        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          {/* Инфо тренера — на мобильном сверху, на xl справа */}
          <Card className="flex h-full flex-col gap-5 p-6 xl:order-last sm:p-7">
            <div className="flex flex-wrap gap-2">
              {trainer.city ? <Badge tone="accent">{trainer.city}</Badge> : null}
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

            <p className="text-base leading-relaxed text-muted">{trainer.bio}</p>

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
          </Card>

          {/* Hero — gradient cover с инициалами, как в TrainerCard */}
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
            <Badge tone="outline">{trainer.specialties.length + sports.length} направлений</Badge>
          </div>

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
            {trainer.specialties.map((specialty) => (
              <div
                key={specialty}
                className="flex h-full items-start gap-4 rounded-card border border-line bg-canvas px-5 py-5"
              >
                <span className="mt-1 text-2xl" aria-hidden="true">
                  🎯
                </span>
                <div>
                  <p className="text-lg font-semibold text-ink">{specialty}</p>
                </div>
              </div>
            ))}
          </div>
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
                  href={`/clubs/${affiliatedClub.id}`}
                  className="inline-flex min-h-12 items-center justify-center rounded-pill bg-accent px-6 text-sm font-semibold text-panel transition-transform duration-200 hover:-translate-y-0.5"
                >
                  Перейти к клубу
                </Link>
              </div>
            </Card>
          </section>
        ) : null}

        {/* ═══ Услуги тренера — STUB: Step 11.3 ═══ */}
        <section aria-labelledby="trainer-offerings-heading">
          <h2
            id="trainer-offerings-heading"
            className="font-display text-3xl font-semibold text-ink"
          >
            Услуги тренера
          </h2>
        </section>

        {/* ═══ Расписание — STUB: Step 11.3 ═══ */}
        <section aria-labelledby="trainer-schedule-heading">
          <h2
            id="trainer-schedule-heading"
            className="font-display text-3xl font-semibold text-ink"
          >
            Расписание
          </h2>
        </section>

        {/* ═══ Отзывы — STUB: Step 11.4 ═══ */}
        <section aria-labelledby="trainer-reviews-heading">
          <h2 id="trainer-reviews-heading" className="font-display text-3xl font-semibold text-ink">
            Отзывы
          </h2>
        </section>
      </div>
    </div>
  );
}
