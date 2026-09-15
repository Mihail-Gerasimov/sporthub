'use client';

/* DetailScheduleWeek — общий week-блок для detail-страниц клуба и тренера
 * (Phase 28.22). Anchor: текущая ISO-неделя (Пн-Вс), без навигации между
 * неделями — слоты вне этой недели вызывающий код фильтрует ДО передачи
 * сюда. Внутри:
 *
 * - 7 day-tabs Пн-Вс с counter; активный — сегодняшний день недели.
 *   Активный таб lime-fill (bg-lime + text-ink), остальные — text-muted
 *   с hover в text-ink. Counter — pill с числом (на активном табе
 *   приглушённый black/20 фон, на неактивных — bg-card).
 * - При клике на день показываем slot-grid этого дня (1 col на base/md,
 *   2 col на lg+). Если слотов в выбранном дне нет → empty-state
 *   «Тренировок нет в этот день» (per-day empty, не для всей недели).
 * - Slot-row: sportName eyebrow + title Bowlby + sub (готовая строка
 *   приходит снаружи: на club «время, тренер»; на trainer «время, зал»)
 *   + chips (свободные места + зал) + price + CTA «Записаться».
 * - CTA: вошедший человек → <Link> на /booking/[id], гость → <button> вызывает
 *   `onGuestSlotAction` (toast «войдите или зарегистрируйтесь»).
 *
 * ⚠️ Фаза 35, шаг 35.34: прежний признак назывался `isAthlete` и означал тип
 * учётной записи. Типа больше нет — записываться может любой вошедший человек,
 * и признак называет теперь именно это.
 */

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { getDateKeyInTimeZone, getWeekStartKey, shiftDateKey } from '@sporthub/domain';

/* Формат слота для week-расписания. priceLabel и sub — уже готовые строки,
 * собирает вызывающий код (на club: sub = `${time}, ${trainerName}`;
 * на trainer: sub = `${time}, ${room}`). */
export type DetailScheduleSlot = {
  id: number;
  date: string;
  title: string;
  sportName: string;
  priceLabel: string;
  availableSpots: number;
  room?: string | null;
  sub: string;
};

type DetailScheduleWeekProps = {
  slots: DetailScheduleSlot[];
  /** Может ли зритель записаться: вошёл и не служебная запись. */
  canAct: boolean;
  /** Callback гостя: показ toast / auth-prompt. Логика — выше по дереву. */
  onGuestSlotAction: () => void;
};

const DAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const;

export function DetailScheduleWeek({ slots, canAct, onGuestSlotAction }: DetailScheduleWeekProps) {
  /* Понедельник текущей ISO-недели + массив 7 дат [Пн..Вс] в формате `YYYY-MM-DD`.
   *
   * Неделя считается по календарю зала — тому же, в котором лежит `slot.date`.
   * Прежний расчёт брал полночь в поясе браузера и собирал дни через `setDate`:
   * у зрителя западнее зала «сегодня» отставало на день, поэтому в воскресенье
   * подсвечивался чужой день, а в понедельник открывалась прошлая неделя целиком —
   * с пустыми вкладками вместо слотов. */
  const { weekDates, todayIndex } = useMemo(() => {
    const todayKey = getDateKeyInTimeZone(new Date());
    const mondayKey = getWeekStartKey(todayKey);
    const dates = Array.from({ length: 7 }, (_, i) => shiftDateKey(mondayKey, i));

    return { weekDates: dates, todayIndex: Math.max(dates.indexOf(todayKey), 0) };
  }, []);

  /* Группировка слотов по дате недели + сортировка по id (стабильный порядок). */
  const slotsByDate = useMemo(() => {
    const map = new Map<string, DetailScheduleSlot[]>();
    for (const slot of slots) {
      const list = map.get(slot.date) ?? [];
      list.push(slot);
      map.set(slot.date, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.id - b.id);
    }
    return map;
  }, [slots]);

  const [activeIndex, setActiveIndex] = useState<number>(todayIndex);
  const activeDate = weekDates[activeIndex] ?? weekDates[0] ?? '';
  const activeSlots = slotsByDate.get(activeDate) ?? [];

  return (
    <div>
      {/* Day-tabs Пн-Вс */}
      <div
        role="tablist"
        aria-label="Дни недели"
        className="scrollbar-hidden mb-4 flex w-max max-w-full overflow-x-auto rounded-pill border border-line bg-card-2 p-1.5"
      >
        {DAY_LABELS.map((label, i) => {
          const date = weekDates[i] ?? '';
          const count = slotsByDate.get(date)?.length ?? 0;
          const isActive = i === activeIndex;
          return (
            <button
              key={label}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={`${label}: ${count} слотов`}
              onClick={() => setActiveIndex(i)}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill px-3.5 py-2 font-body text-[11px] font-bold uppercase tracking-[0.14em] transition-colors ${
                isActive ? 'bg-lime text-ink' : 'text-muted hover:text-ink'
              }`}
            >
              <span>{label}</span>
              <span
                className={`rounded-pill px-2 py-0.5 text-[10px] tabular-nums ${
                  isActive ? 'bg-ink text-bg' : 'bg-card text-muted'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Slot-grid активного дня + per-day empty-state */}
      {activeSlots.length > 0 ? (
        <div className="grid gap-2.5 lg:grid-cols-2">
          {activeSlots.map((slot) => (
            <div
              key={slot.id}
              className="grid grid-cols-1 gap-3 rounded-[14px] border border-line bg-card-2 px-4 py-3.5 transition-colors hover:border-lime md:grid-cols-[1fr_auto] md:items-center"
            >
              <div className="min-w-0">
                <p className="font-body text-[9px] font-bold uppercase tracking-[0.22em] text-muted">
                  {slot.sportName}
                </p>
                <h4 className="mt-1 font-display text-base text-ink">{slot.title}</h4>
                <p className="mt-1 font-body text-xs font-medium text-muted">{slot.sub}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="inline-flex items-center rounded-pill border border-lime/30 bg-lime-soft px-2 py-1 font-body text-[9px] font-bold uppercase tracking-[0.10em] text-lime">
                    Свободно {slot.availableSpots} мест
                  </span>
                  <span className="inline-flex items-center rounded-pill border border-line bg-transparent px-2 py-1 font-body text-[9px] font-bold uppercase tracking-[0.10em] text-ink">
                    {slot.room ?? 'Зал уточняется'}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 md:flex-col md:items-end md:justify-start md:gap-2">
                <span className="font-display text-sm tabular-nums text-ink">
                  {slot.priceLabel}
                </span>
                {canAct ? (
                  <Link
                    href={`/booking/${slot.id}`}
                    aria-label={`Записаться на ${slot.title}`}
                    className="inline-flex items-center justify-center rounded-pill bg-lime px-3.5 py-2 font-body text-[10px] font-bold uppercase tracking-[0.14em] text-ink transition-colors hover:bg-lime-hov"
                  >
                    Записаться
                  </Link>
                ) : (
                  <button
                    type="button"
                    aria-label={`Записаться на ${slot.title}`}
                    onClick={onGuestSlotAction}
                    className="inline-flex items-center justify-center rounded-pill bg-lime px-3.5 py-2 font-body text-[10px] font-bold uppercase tracking-[0.14em] text-ink transition-colors hover:bg-lime-hov"
                  >
                    Записаться
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-[14px] border border-dashed border-line bg-card-2 px-5 py-5 text-sm leading-relaxed text-muted">
          Тренировок нет в этот день.
        </div>
      )}
    </div>
  );
}
