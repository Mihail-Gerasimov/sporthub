/**
 * «Сегодня в фокусе» — правая колонка героя (шаг 38.70), в виде эталона
 * (`HomePage.tsx:403-456`, чек-лист step-23/24): белая карточка радиусом 24 с глубокой
 * тенью и тонкой светлой обводкой; тёмная верхняя зона высотой 200 (в макете — фото
 * клуба: фото у клубов нет — долг Д-10, зона несёт время и имя первого занятия),
 * ниже — «Ближайшие занятия» до трёх строк: время display-шрифтом, название и клуб,
 * справа кнопка. Логика наша (реестр № 40–46): первое занятие дня, маркер LIVE,
 * «Записаться» → `/booking/{id}`, живой счётчик «N занятий сегодня» со склонением
 * из словаря `PLURAL`; плавающие виджеты макета не переносятся (статистика — вне фазы).
 * У счётчика — ссылка «Все слоты» на якорь секции слотов из словаря (38.88): прежняя
 * кнопка героя «Смотреть слоты и окна» вела в никуда (тупик № 1), в герое эталона
 * кнопок нет, и вход к слотам держит эта карточка.
 *
 * Почему не `ui/Card`: у карточки тёмная верхняя зона и тень «парящего» слоя на плашке
 * героя — у `Card` белая поверхность с подложкой-тенью для светлого фона.
 */
import Link from 'next/link';

import type { UpcomingSessionItem } from '@/components/schedule';
import { FOCUS } from '@/lib/home-copy';
import { homeSectionHref } from '@/lib/home-sections';
import { countRu, PLURAL } from '@/lib/plural';
import { cn } from '@/lib/utils';

type FocusCardProps = {
  /** Занятия сегодня, ближайшее — первым. */
  sessions: UpcomingSessionItem[];
  /** Дата словами для пустого состояния: «15 сентября». */
  dateLabel: string;
};

/** Сколько строк расписания показывает карточка — как в макете. */
const ROWS = 3;

/** Порог «мест мало»: красная кнопка в макете стоит на двух местах. */
const LOW_SPOTS = 2;

/** Кнопка строки: первое занятие зовёт записаться, остальные называют места. */
function rowButtonClass(index: number, spots: number): string {
  if (index === 0) return 'border-lime/30 bg-lime-soft text-lime-hov';
  if (spots <= LOW_SPOTS) return 'border-red/30 bg-red/10 text-red';

  return 'border-line bg-bg text-muted';
}

export function FocusCard({ sessions, dateLabel }: FocusCardProps) {
  const focus = sessions[0];

  return (
    <aside
      aria-label={FOCUS.eyebrow}
      className="relative overflow-hidden rounded-[24px] border border-plate-ink/5 bg-card text-ink shadow-floating"
    >
      {/* Верхняя зона: тёмная плашка с временем и именем первого занятия */}
      <div className="relative flex h-[200px] flex-col justify-between bg-plate p-4 text-plate-ink hero-bg-blank">
        <div className="flex items-center justify-between gap-2.5">
          <span className="font-body text-[10px] font-bold tracking-[0.18em] text-lime uppercase">
            {FOCUS.eyebrow}
          </span>
          {focus ? (
            <span className="inline-flex items-center gap-1.5 font-body text-[10px] font-bold tracking-[0.14em] text-orange uppercase">
              <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-orange" />
              {FOCUS.live}
            </span>
          ) : null}
        </div>
        <div>
          <p className="m-0 font-display text-[40px] leading-[0.9] tracking-[0.02em] tabular-nums">
            {focus?.startTime ?? '—:—'}
          </p>
          <h3 className="m-0 mt-1 font-display text-[20px] leading-tight uppercase">
            {focus?.title ?? FOCUS.emptyTitle}
          </h3>
          <p className="m-0 mt-0.5 font-body text-[12px] text-plate-muted">
            {focus ? focus.clubName : FOCUS.emptyHint(dateLabel)}
          </p>
        </div>
      </div>

      {/* Расписание: до трёх строк, как в макете */}
      <div className="px-4 pt-3.5 pb-4">
        <p className="m-0 mb-2.5 font-display text-[13px] font-bold tracking-[0.06em] uppercase">
          {FOCUS.upcoming}
        </p>
        {sessions.length === 0 ? (
          <p className="m-0 font-body text-[12px] text-muted">{FOCUS.emptyHint(dateLabel)}</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {sessions.slice(0, ROWS).map((session, index) => (
              <li
                key={session.id}
                className={cn(
                  'flex items-center gap-3 py-2.25',
                  index < Math.min(sessions.length, ROWS) - 1 && 'border-b border-line',
                )}
              >
                <span className="w-10 shrink-0 font-display text-[13px] font-bold tabular-nums">
                  {session.startTime}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-body text-[12px] font-bold">
                    {session.title}
                  </span>
                  <span className="block truncate font-body text-[10px] text-muted">
                    {session.clubName}
                  </span>
                </span>
                <Link
                  href={`/booking/${session.id}`}
                  aria-label={`${FOCUS.cta}: ${session.title}, ${session.startTime}`}
                  className={cn(
                    'shrink-0 rounded-[8px] border px-3 py-[5px] font-body text-[10px] font-extrabold no-underline transition-colors hover:border-lime hover:text-lime-hov',
                    rowButtonClass(index, session.availableSpots),
                  )}
                >
                  {index === 0 ? FOCUS.cta : FOCUS.spots(session.availableSpots)}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {/* Живой счётчик — наш контракт (реестр № 44); справа — вход к секции слотов */}
        <p className="m-0 mt-3 flex items-center justify-between gap-3 border-t border-line pt-3 font-body text-[12px] text-muted">
          <span>
            <strong className="font-display text-[14px] text-lime-hov tabular-nums">
              {countRu(sessions.length, PLURAL.sessions)}
            </strong>{' '}
            {FOCUS.today}
          </span>
          <Link
            href={homeSectionHref('availability')}
            className="font-semibold text-lime-hov no-underline hover:text-ink"
          >
            {FOCUS.allSlots} <span aria-hidden="true">→</span>
          </Link>
        </p>
      </div>
    </aside>
  );
}
