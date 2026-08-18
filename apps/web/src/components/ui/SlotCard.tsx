'use client';

/*
 * SlotCard — общая карточка слота на главной (Phase 28.12 + 28.13).
 *
 * Дизайн handoff'а: claude-design/slots-availability/sporthub/project/
 * SportHub Slots - Availability.html (блок .slot-card).
 *
 * Phase 28.12 (изначально TrainerSlotCard) — карточка для слотов тренеров.
 * Phase 28.13 — переехала в ui/ как нейтральная: контракт не привязан ни к
 * `TrainerAvailabilityItem`, ни к `UpcomingSessionItem`. Источники данных
 * мапят свои поля на универсальные `{ eyebrow, name, sport, ... }` через
 * локальные helper'ы (см. TrainerAvailability.tsx + ClubAvailability.tsx).
 *
 * Структура:
 *  - Hero: eyebrow + capacity-pill (всегда лайм со склонением «1 место /
 *    2-4 места / 5+ мест»), name (Bowlby, line-clamp 2), sport (Oswald
 *    muted, line-clamp 1), watermark номера (`index+1`), диагональный
 *    lime/orange луч + штриховка через `.slot-hero::before`.
 *  - Boxes: «Время» / «Стоимость» — fluid font-size + tabular-nums + nowrap.
 *  - Footer: «Площадка» (venueLabel + опц. room) + CTA «К записи».
 *
 * Tone-ротация (`(['lime','orange','blank'])[index%3]`) — единый паттерн
 * с ClubCard / TrainerCard (28.8/28.9).
 *
 * `<article>` НЕ оборачивается в `<Link>`/<button>. Кликабелен только CTA;
 * onSelect делегируется наверх (для auth-guard).
 */
import { formatPrice } from '@/lib/utils';

type SlotCardProps = {
  /** Eyebrow в hero — UPPERCASE-метка типа слота (например «Персональная услуга» или «Групповое занятие»). */
  eyebrow: string;
  /** Главное имя в hero (Bowlby): тренер для trainer-режима, название занятия для clubs. */
  name: string;
  /** Подзаголовок под name (Oswald muted): вид спорта для тренеров, имя клуба для clubs. */
  sport: string;
  /** Сколько мест свободно — для capacity-pill с правильным склонением. */
  availableSpots: number;
  /** Время начала «HH:MM». */
  startTime: string;
  /** Время окончания «HH:MM». */
  endTime: string;
  /** Цена за слот (рубли). */
  price: number;
  /** Площадка (имя клуба или venue тренера). */
  venueLabel: string;
  /** Опц. имя зала/комнаты внутри площадки. */
  room?: string;
  /** Индекс в списке (0-based) — определяет watermark «01..N» и tone-ротацию. */
  index: number;
  /** ID слота, передаётся в onSelect при клике CTA. */
  slotId: number;
  /** Колбек выбора слота — auth-guard живёт уровнем выше. */
  onSelect: (slotId: number) => void;
  /** ARIA-label для CTA-кнопки (например «К записи: Иван Иванов»). */
  ctaAriaName: string;
};

/* Русская плюрализация для «место/места/мест». */
function getPlacesLabel(value: number): string {
  const mod10 = value % 10;
  const mod100 = value % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return 'место';
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return 'места';
  }
  return 'мест';
}

const TONES = ['lime', 'orange', 'blank'] as const;

export function SlotCard({
  eyebrow,
  name,
  sport,
  availableSpots,
  startTime,
  endTime,
  price,
  venueLabel,
  room,
  index,
  slotId,
  onSelect,
  ctaAriaName,
}: SlotCardProps) {
  const tone = TONES[index % 3];
  const watermark = String(index + 1).padStart(2, '0');
  const placesLabel = getPlacesLabel(availableSpots);

  return (
    <article
      data-testid="slot-card"
      className={`slot-card tone-${tone} h-full overflow-hidden rounded-[22px] border border-[var(--ui-line)] bg-[var(--ui-card)] transition-[border-color,transform] duration-200 hover:-translate-y-[2px] hover:border-[var(--ui-lime)]`}
    >
      {/* HERO: eyebrow + capacity, имя, sport-метка, watermark + диагональный луч */}
      <div className="slot-hero relative grid min-h-[156px] gap-3 overflow-hidden border-b border-[var(--ui-line-2)] bg-[var(--ui-bg)] p-[18px] sm:min-h-[168px] sm:p-[22px]">
        <span className="hero-wm pointer-events-none absolute right-[14px] bottom-1 select-none font-display text-[88px] leading-[0.85] tracking-[-0.02em] text-ink/[0.04]">
          {watermark}
        </span>

        <div className="relative z-[2] flex min-w-0 items-center justify-between gap-3">
          <p className="slot-eyebrow lime m-0 min-w-0 truncate font-body text-[10px] font-bold tracking-[0.22em] uppercase">
            {eyebrow}
          </p>
          <span className="capacity-pill lime inline-flex flex-shrink-0 items-center rounded-full px-[11px] py-[5px] font-body text-[10px] font-bold tracking-[0.16em] whitespace-nowrap uppercase">
            Свободно {availableSpots} {placesLabel}
          </span>
        </div>

        <h3 className="slot-name relative z-[2] m-0 line-clamp-2 font-display text-[18px] leading-[1.1] tracking-[-0.005em] text-[var(--ui-ink)] sm:text-[19px]">
          {name}
        </h3>
        <p className="slot-sport relative z-[2] m-0 line-clamp-1 font-body text-[13px] leading-[1.4] font-medium text-[var(--ui-muted)]">
          {sport}
        </p>
      </div>

      {/* BOXES: время + стоимость — всегда в одну строку */}
      <div className="slot-boxes grid grid-cols-2 gap-2 px-[18px] pt-4 sm:gap-2.5 sm:px-[22px] sm:pt-[18px]">
        <div className="slot-box flex min-w-0 flex-col gap-1.5 rounded-[12px] border border-[var(--ui-line)] bg-[var(--ui-card-2)] px-3 py-2.5 sm:px-3.5 sm:py-3">
          <p className="slot-box-lbl m-0 font-body text-[9px] font-bold tracking-[0.22em] text-[var(--ui-muted)] uppercase">
            Время
          </p>
          <p className="slot-box-val m-0 font-display leading-none tracking-[0.01em] text-[var(--ui-ink)]">
            {startTime} – {endTime}
          </p>
        </div>

        <div className="slot-box flex min-w-0 flex-col gap-1.5 rounded-[12px] border border-[var(--ui-line)] bg-[var(--ui-card-2)] px-3 py-2.5 sm:px-3.5 sm:py-3">
          <p className="slot-box-lbl m-0 font-body text-[9px] font-bold tracking-[0.22em] text-[var(--ui-muted)] uppercase">
            Стоимость
          </p>
          <p className="slot-box-val m-0 font-display leading-none tracking-[0.01em] text-[var(--ui-ink)]">
            {formatPrice(price)}
          </p>
        </div>
      </div>

      {/* FOOTER: площадка + CTA */}
      <div className="slot-foot mx-[18px] mt-4 grid grid-cols-[1fr_auto] items-end gap-3.5 border-t border-[var(--ui-line-2)] pt-4 pb-[18px] sm:mx-[22px] sm:mt-[18px] sm:pb-[22px]">
        <div className="min-w-0">
          <p className="slot-venue-lbl m-0 mb-1.5 font-body text-[9px] font-bold tracking-[0.22em] text-[var(--ui-muted)] uppercase">
            Площадка
          </p>
          <p className="slot-venue-name m-0 line-clamp-1 font-body text-[14px] leading-[1.3] font-semibold text-[var(--ui-ink)]">
            {venueLabel}
          </p>
          {room ? (
            <p className="slot-room m-0 mt-1 line-clamp-1 font-body text-[12px] leading-[1.3] font-normal text-[var(--ui-muted)]">
              {room}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => onSelect(slotId)}
          aria-label={ctaAriaName}
          // Phase 30.9: переведено на primary CTA по frontend-design SKILL —
          // lime-fill + rounded-pill + cursor-pointer + hover:bg-lime-hov.
          // Микро-анимация стрелочки (hover:gap-2.5) сохранена.
          className="slot-cta inline-flex flex-shrink-0 items-center gap-1.5 rounded-pill bg-lime px-3.5 py-2 font-body text-[10px] font-bold tracking-[0.14em] whitespace-nowrap text-ink uppercase cursor-pointer transition-[gap,background-color] duration-150 hover:gap-2.5 hover:bg-lime-hov"
        >
          К записи
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </article>
  );
}
