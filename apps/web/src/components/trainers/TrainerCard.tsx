'use client';

/*
 * TrainerCard — карточка тренера по эталону витрины (фаза 38, шаг 38.74;
 * `HomePage.tsx:120-160`, чек-лист эталона step-45…48).
 *
 * Форма — из макета: белая карточка радиусом 18 с отступом 18 и тенью покоя, при
 * наведении рамка зеленеет, карточка поднимается на 3px, зелёная риска сверху растёт
 * 20 → 36px; аватар 56×56 радиусом 14 — с зелёной рамкой и точкой у доступного;
 * имя display 16, специализация 11px, звезда 10px с рейтингом и отзывами, справа
 * цена «от N»; чип «Доступен сейчас» — 10px на зелёной подложке с точкой.
 *
 * Логика — наша (реестр № 97–108): «доступен сейчас» — не флаг, а расписание дня
 * (`availableSlotsCount` — свободные окна сегодня, которые ещё впереди по часам зала);
 * вся карточка ведёт на СТРАНИЦУ тренера растянутой ссылкой с именем, «К записи» —
 * отдельная ссылка на ближайшее окно (вложенных `<a>` нет: обёртки вокруг `<article>`
 * не существует); ниже остаётся наше — sport-tag, «N лет опыта», «Группа», «Площадка /
 * Ближайшее окно» (у макета только булев индикатор, у нас конкретное окно), лента
 * специализаций, цитата. Знак «проверено» — по `verifiedAt` (38.52). Ротация тона
 * и водяной знак сняты: макет однотонный. Hover имени — классом (реестр № 108).
 *
 * Аватар — `avatarUrl`; без адреса или при ошибке загрузки — инициалы на подложке.
 * STUB: загрузки фото на площадке нет (долг Д-10), инициалы стоят вместо снимка,
 * пока тренер не сможет его загрузить.
 */
import Link from 'next/link';
import { useState } from 'react';

import { ChipMarquee, VerifiedBadge } from '@/components/ui';
import { getTrainerInitials } from '@/components/trainers/trainer-utils';
import { PLURAL, pluralRu } from '@/lib/plural';
import { cn, formatDate, formatPrice } from '@/lib/utils';

import type { TrainerDirectoryItem } from '@/components/trainers/trainer-preview';

type TrainerCardProps = {
  trainer: TrainerDirectoryItem;
  /** Подсветка карточки при выборе на карте — зелёная рамка вместо обычной. */
  highlighted?: boolean;
};

/** Чип «характеристика» — опыт, группа, вид спорта. */
const CHIP =
  'inline-flex items-center whitespace-nowrap rounded-full border border-line bg-card-2 px-2.5 py-1 font-body text-[10px] font-bold uppercase tracking-[0.14em] text-ink';

export function TrainerCard({ trainer, highlighted = false }: TrainerCardProps) {
  const [photoBroken, setPhotoBroken] = useState(false);
  const showPhoto = trainer.avatarUrl !== '' && !photoBroken;
  // «Доступен сейчас» — есть свободное окно сегодня, ещё впереди по часам зала.
  const available = trainer.availableSlotsCount > 0;
  // «Новый» — у тренера ещё нет ни рейтинга, ни отзывов.
  const isNew = trainer.reviewCount === 0 && trainer.rating === 0;
  const isGroup = ['group', 'mini_group'].includes(trainer.primaryOfferingFormat ?? '');
  // Специализация под именем — первая услуга, иначе био; цитата не дублирует её.
  const headline = trainer.primaryOfferingTitle ?? trainer.bio ?? '';
  const quote = headline === trainer.bio ? '' : (trainer.bio ?? '');
  const distanceLabel =
    trainer.distanceKm === null
      ? `${trainer.availableSlotsCount} ${pluralRu(trainer.availableSlotsCount, PLURAL.windows)}`
      : `${trainer.distanceKm.toFixed(1)} км`;
  const slotLabel =
    trainer.nextSlotDate && trainer.nextSlotStartTime
      ? `${formatDate(trainer.nextSlotDate, { day: 'numeric', month: 'long' })}, ${trainer.nextSlotStartTime}`
      : 'Слоты скоро появятся';
  const ctaHref = trainer.nextSlotId
    ? `/booking/${trainer.nextSlotId}`
    : `/trainers/${trainer.slug}`;
  const tagItems = trainer.specialtyNames.map((label) => ({ label }));

  return (
    <article
      data-testid="trainer-card"
      data-highlighted={highlighted ? 'true' : 'false'}
      data-available={available ? 'true' : 'false'}
      aria-label={`Карточка тренера: ${trainer.name}`}
      className={cn(
        'group relative flex h-full flex-col rounded-[18px] border bg-card p-[18px] shadow-card transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-[3px] hover:border-lime/40 hover:shadow-floating',
        highlighted ? 'border-lime' : 'border-line',
      )}
    >
      {/* Зелёная риска сверху: 20px, при наведении 36px. */}
      <span
        aria-hidden="true"
        className="mb-3.5 block h-[3px] w-5 rounded-[3px] bg-lime transition-[width] duration-200 group-hover:w-9"
      />

      {/* Аватар 56×56: зелёная рамка и точка у доступного, серая — у занятого. */}
      <div className="relative mb-3 size-14">
        {showPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element -- адрес фото из данных, размер фиксирован
          <img
            src={trainer.avatarUrl}
            alt={trainer.name}
            loading="lazy"
            onError={() => setPhotoBroken(true)}
            className={cn(
              'size-14 rounded-[14px] border-2 object-cover',
              available ? 'border-lime' : 'border-line',
            )}
          />
        ) : (
          <span
            aria-hidden="true"
            className={cn(
              'flex size-14 items-center justify-center rounded-[14px] border-2 bg-card-2 font-display text-[18px] uppercase text-ink',
              available ? 'border-lime' : 'border-line',
            )}
          >
            {getTrainerInitials(trainer.name)}
          </span>
        )}
        {available ? (
          <span
            aria-hidden="true"
            className="absolute bottom-px right-px size-3 rounded-full border-2 border-card bg-lime"
          />
        ) : null}
      </div>

      {/* Имя — ссылка, растянутая на карточку; рядом знак проверки. */}
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="m-0 font-display text-[16px] font-black leading-[1.1] text-ink">
          <Link
            href={`/trainers/${trainer.slug}`}
            className="no-underline transition-colors hover:text-lime-hov after:absolute after:inset-0 after:z-[1] after:content-['']"
          >
            {trainer.name}
          </Link>
        </h3>
        {trainer.verifiedAt ? (
          <span className="relative z-[2]">
            <VerifiedBadge ownerType="trainer" />
          </span>
        ) : null}
      </div>
      <p className="m-0 mt-0.5 line-clamp-2 font-body text-[11px] leading-[1.45] text-muted">
        {headline}
      </p>

      {/* Рейтинг и цена — в один ряд, как в макете. */}
      <div className="mt-2.5 flex items-center justify-between gap-3">
        {isNew ? (
          <span data-testid="trainer-card-new-badge" className={CHIP}>
            Новый
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] text-muted">
            <span
              role="img"
              aria-label={`Рейтинг: ${trainer.rating.toFixed(1)} из 5`}
              className="inline-flex items-center gap-1"
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="size-2.5 fill-current text-lime-hov"
              >
                <path d="m12 3.2 2.72 5.52 6.09.89-4.4 4.29 1.04 6.07L12 17.09l-5.45 2.88 1.04-6.07-4.4-4.29 6.09-.89L12 3.2Z" />
              </svg>
              <span className="font-display text-[12px] font-extrabold tabular-nums text-ink">
                {trainer.rating.toFixed(1)}
              </span>
            </span>
            <span>({trainer.reviewCount})</span>
          </span>
        )}
        <span className="font-display text-[13px] font-extrabold tabular-nums text-ink">
          от {formatPrice(trainer.priceFrom)}
        </span>
      </div>

      {available ? (
        <span className="mt-2.5 inline-flex w-fit items-center gap-1 rounded-[6px] border border-lime/20 bg-lime/10 px-2.5 py-[3px] font-body text-[10px] font-bold text-lime-hov">
          <span aria-hidden="true" className="size-[5px] rounded-full bg-lime" />
          Доступен сейчас
        </span>
      ) : null}

      {/* Наше: чипы характеристик — вид спорта, опыт, группа, расстояние или окна. */}
      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        {trainer.sports[0] ? <span className={CHIP}>{trainer.sports[0].name}</span> : null}
        <span className={CHIP}>{trainer.experienceYears} лет опыта</span>
        {isGroup ? (
          <span className={cn(CHIP, 'border-lime/30 bg-lime-soft text-lime-hov')}>Группа</span>
        ) : null}
        <span className="font-body text-xs font-medium text-muted">{distanceLabel}</span>
      </div>

      {/* Наше: площадка и ближайшее окно — конкретное, а не булев индикатор макета. */}
      <div className="mt-3.5 grid grid-cols-1 gap-3 rounded-[14px] border border-line bg-card-2 px-4 py-3.5 sm:grid-cols-[1fr_auto] sm:gap-x-6">
        <div className="min-w-0">
          <p className="m-0 mb-1 font-body text-[9px] font-bold uppercase tracking-[0.22em] text-muted">
            Площадка
          </p>
          <p className="m-0 line-clamp-1 font-body text-[13px] font-semibold leading-[1.3] text-ink">
            {trainer.venueLabel || 'Без привязки'}
          </p>
          {trainer.venueName && trainer.venueAddress ? (
            <p className="m-0 mt-0.5 line-clamp-1 font-body text-[11px] leading-tight text-muted">
              {trainer.venueAddress}
            </p>
          ) : null}
        </div>
        <div className="min-w-0">
          <p className="m-0 mb-1 font-body text-[9px] font-bold uppercase tracking-[0.22em] text-muted">
            Ближайшее окно
          </p>
          <p className="m-0 line-clamp-1 font-body text-[13px] font-semibold leading-[1.3] text-ink">
            {slotLabel}
          </p>
        </div>
      </div>

      {/* Наше: лента специализаций — под растянутой ссылкой, декоративная (без drag
          и паузы): клик по чипу ведёт на страницу тренера (над ссылкой — только знак и «К записи»). */}
      <div className="-mx-[18px] mt-3.5">
        <ChipMarquee items={tagItems} variant="solid" accent="lime" interactive={false} />
      </div>

      {/* Наше: цитата и «К записи» — отдельная ссылка на ближайшее окно; над растянутой
          ссылкой возвышается только она, цитата — под ней. */}
      <div className="mt-auto flex items-center justify-between gap-4 border-t border-line pt-3.5">
        <p className="m-0 line-clamp-2 font-body text-[12px] italic leading-[1.45] text-muted">
          {quote}
        </p>
        <Link
          href={ctaHref}
          aria-label={`К записи: ${trainer.name}`}
          className="relative z-[2] inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap font-body text-[11px] font-bold uppercase tracking-[0.14em] text-lime-hov no-underline transition-colors hover:text-ink"
        >
          К записи
          <span aria-hidden="true" className="text-[14px]">
            →
          </span>
        </Link>
      </div>
    </article>
  );
}
