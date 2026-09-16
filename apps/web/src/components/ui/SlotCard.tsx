'use client';

/**
 * SlotCard — общая карточка слота на главной: занятие клуба или окно тренера.
 *
 * Контракт нейтральный (Phase 28.13): не привязан ни к `TrainerAvailabilityItem`,
 * ни к `UpcomingSessionItem` — источники мапят свои поля на `{ eyebrow, name, sport,
 * availableSpots, … }` (см. `TrainerAvailability.tsx`, `ClubAvailability.tsx`).
 *
 * Шаг 38.81 — вид эталона ПРОСПОРТ (сценарий слотов, реестр «слоты» № 118–132):
 *  - карточка `rounded-[18px]` с обводкой, при наведении зеленеет обводка, без подъёма;
 *  - hero-зона на `bg-card-2` с диагональным лучом и штриховкой (`.slot-hero::before`,
 *    тон по `index % 3` — общий приём с карточками клубов и тренеров) и водяным номером;
 *  - подпись мест — `spotsLabel` из `lib/slot-spots` (склонение из словаря `PLURAL`,
 *    а не своя копия правила), при `≤ LOW_SPOTS` — КРАСНАЯ, как в макете и в строке
 *    «Сегодня в фокусе» (реестр № 124: «дизайн краснит остаток ≤2 — у нас порога нет»);
 *  - время и цена display-шрифтом с `tabular-nums`, в одну строку при любой ширине;
 *  - CTA «К записи» — `ui/Button` (outline positive), а не своя кнопка.
 *
 * Путь к записи сохранён (реестр № 129–130): кликабелен только CTA, он зовёт
 * `onSelect(slotId)` наверх, где сторож входа ведёт вошедшего в `/booking/{id}`,
 * гостю — тост. `<article>` не оборачивается ни в ссылку, ни в кнопку.
 * `data-testid="slot-card"` — из реестра (приложение Б, строка 8), остаётся.
 */
import { Button } from '@/components/ui/Button';
import { isLowSpots, spotsLabel } from '@/lib/slot-spots';
import { cn, formatPrice } from '@/lib/utils';

type SlotCardProps = {
  /** Eyebrow в hero — UPPERCASE-метка типа слота («Персональная услуга» / «Групповое занятие»). */
  eyebrow: string;
  /** Главное имя в hero (display): тренер для trainer-режима, название занятия для clubs. */
  name: string;
  /** Подзаголовок под name (body muted): вид спорта для тренеров, имя клуба для clubs. */
  sport: string;
  /** Сколько мест свободно — подпись со склонением, при малом остатке красная. */
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
  /** Индекс в списке (0-based) — водяной номер «01..N» и тон hero-зоны. */
  index: number;
  /** ID слота, передаётся в onSelect при клике CTA. */
  slotId: number;
  /** Колбек выбора слота — сторож входа живёт уровнем выше. */
  onSelect: (slotId: number) => void;
  /** Доступное имя CTA (например «К записи: Иван Иванов»). */
  ctaAriaName: string;
};

/** Тон hero-зоны по позиции — общий приём с карточками клубов и тренеров. */
const TONES = ['lime', 'orange', 'blank'] as const;

const BOX_CLASS =
  'slot-box flex min-w-0 flex-col gap-1.5 rounded-[12px] border border-line bg-card-2 px-3 py-2.5 sm:px-3.5 sm:py-3';
const BOX_LABEL_CLASS = 'm-0 font-body text-[9px] font-bold tracking-[0.22em] text-muted uppercase';
const BOX_VALUE_CLASS = 'slot-box-val m-0 font-display leading-none tracking-[0.01em] text-ink';

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
  const tone = TONES[index % TONES.length];
  const watermark = String(index + 1).padStart(2, '0');
  const low = isLowSpots(availableSpots);

  return (
    <article
      data-testid="slot-card"
      className={`slot-card tone-${tone} h-full overflow-hidden rounded-[18px] border border-line bg-card transition-[border-color] duration-200 hover:border-lime`}
    >
      {/* HERO: метка типа + места, имя, подзаголовок, водяной номер, луч по тону */}
      <div className="slot-hero relative grid min-h-[156px] gap-3 overflow-hidden border-b border-line-2 bg-card-2 p-[18px] sm:min-h-[168px] sm:p-[22px]">
        <span
          aria-hidden="true"
          className="hero-wm pointer-events-none absolute right-[14px] bottom-1 font-display text-[88px] leading-[0.85] tracking-[-0.02em] text-ink/[0.04] select-none"
        >
          {watermark}
        </span>

        <div className="relative z-[2] flex min-w-0 items-center justify-between gap-3">
          <p className="slot-eyebrow lime m-0 min-w-0 truncate font-body text-[10px] font-bold tracking-[0.22em] uppercase">
            {eyebrow}
          </p>
          {/* Мало мест — красная подпись: остаток ≤ LOW_SPOTS, как в макете. */}
          <span
            className={cn(
              'inline-flex flex-shrink-0 items-center rounded-full border px-[11px] py-[5px] font-body text-[10px] font-bold tracking-[0.16em] whitespace-nowrap uppercase',
              low
                ? 'border-red/30 bg-red/10 text-red'
                : 'border-lime/30 bg-lime-soft text-lime-hov',
            )}
          >
            Свободно {spotsLabel(availableSpots)}
          </span>
        </div>

        <h3 className="slot-name relative z-[2] m-0 line-clamp-2 font-display text-[18px] leading-[1.1] tracking-[-0.005em] text-ink sm:text-[19px]">
          {name}
        </h3>
        <p className="slot-sport relative z-[2] m-0 line-clamp-1 font-body text-[13px] leading-[1.4] font-medium text-muted">
          {sport}
        </p>
      </div>

      {/* BOXES: время и стоимость — display-шрифт, tabular-nums, всегда в одну строку */}
      <div className="slot-boxes grid grid-cols-2 gap-2 px-[18px] pt-4 sm:gap-2.5 sm:px-[22px] sm:pt-[18px]">
        <div className={BOX_CLASS}>
          <p className={BOX_LABEL_CLASS}>Время</p>
          <p className={BOX_VALUE_CLASS}>
            {startTime} – {endTime}
          </p>
        </div>
        <div className={BOX_CLASS}>
          <p className={BOX_LABEL_CLASS}>Стоимость</p>
          <p className={BOX_VALUE_CLASS}>{formatPrice(price)}</p>
        </div>
      </div>

      {/* FOOTER: площадка + CTA; путь к записи — через onSelect наверх */}
      <div className="slot-foot mx-[18px] mt-4 grid grid-cols-[1fr_auto] items-end gap-3.5 border-t border-line-2 pt-4 pb-[18px] sm:mx-[22px] sm:mt-[18px] sm:pb-[22px]">
        <div className="min-w-0">
          <p className="slot-venue-lbl m-0 mb-1.5 font-body text-[9px] font-bold tracking-[0.22em] text-muted uppercase">
            Площадка
          </p>
          <p className="slot-venue-name m-0 line-clamp-1 font-body text-[14px] leading-[1.3] font-semibold text-ink">
            {venueLabel}
          </p>
          {room ? (
            <p className="slot-room m-0 mt-1 line-clamp-1 font-body text-[12px] leading-[1.3] font-normal text-muted">
              {room}
            </p>
          ) : null}
        </div>

        <Button
          size="xs"
          variant="secondary"
          aria-label={ctaAriaName}
          onClick={() => onSelect(slotId)}
          trailingIcon={<span>→</span>}
        >
          К записи
        </Button>
      </div>
    </article>
  );
}
