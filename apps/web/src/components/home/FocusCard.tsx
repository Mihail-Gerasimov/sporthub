'use client';

/**
 * Правая колонка героя — карточка клуба по макету (шаг 38.116; `HomePage.tsx:403-456`,
 * чек-лист step-23/24): белая карточка радиусом 24 с глубокой тенью (`shadow-deep`,
 * 0 32 80 .5) и обводкой white .06; сверху фото клуба высотой 200 с затемнением снизу
 * (токен `--ui-decor-photo-shade`), на нём бейдж «Верифицирован» (по `verifiedAt`),
 * имя display 20 и рейтинг моно 12 с числом отзывов и адресом; ниже «Ближайшие занятия»
 * до трёх строк: время моно 13, название 12, тренер 10, справа кнопка `ui/Button`
 * размера `xs` ссылкой на запись — первое занятие «Записаться» (зелёная мягкая), мало
 * мест — «🔥 N места» (тон «мало мест»), остальные — «N мест» (обводка).
 *
 * Логика наша (реестр № 40–46): клуб — клуб ближайшего занятия дня всей площадки
 * (без занятий — лучший по рейтингу), строки — ЕГО занятия сегодня, куда ещё можно
 * прийти (предикат домена, 38.81); каждая кнопка ведёт на `/booking/{id}`; подпись мест
 * и порог «мало» — из `lib/slot-spots`. Без занятий — тот же каркас с подсказкой даты;
 * без клуба (пустой каталог) — тёмная зона с «Слоты скоро появятся». Плавающие
 * «Запись подтверждена!» и «Моя статистика» макета не переносятся.
 *
 * Фото — `imageUrls[0]`; без адреса или при ошибке — заглушка «Фото клуба».
 * STUB: загрузки фото на площадке нет (долг Д-10), заглушка стоит, пока владелец
 * не загрузит снимок. Клиентская — только ради ошибки загрузки фото.
 *
 * Почему не `ui/Card`: тень «парящего» слоя на плашке героя и фото-зона с затемнением —
 * у `Card` белая поверхность с подложкой-тенью для светлого фона.
 */
import { useState } from 'react';

import type { UpcomingSessionItem } from '@/components/schedule';
import { Button } from '@/components/ui';
import { FOCUS } from '@/lib/home-copy';
import { isLowSpots, spotsLabel } from '@/lib/slot-spots';
import { cn } from '@/lib/utils';
import type { Club } from '@sporthub/types';

type FocusCardProps = {
  /** Клуб героя; пусто — каталог пуст. */
  club?: Club;
  /** Занятия клуба сегодня, ближайшее — первым. */
  sessions: UpcomingSessionItem[];
  /** Дата словами для пустого состояния: «15 сентября». */
  dateLabel: string;
};

/** Сколько строк расписания показывает карточка — как в макете. */
const ROWS = 3;

/** Кнопка строки: первое занятие зовёт записаться, мало мест — тон «мало мест», прочие — обводка. */
function rowButtonVariant(index: number, spots: number): 'soft' | 'alert' | 'outline' {
  if (index === 0) return 'soft';
  if (isLowSpots(spots)) return 'alert';

  return 'outline';
}

export function FocusCard({ club, sessions, dateLabel }: FocusCardProps) {
  const [photoBroken, setPhotoBroken] = useState(false);
  const photo = club?.imageUrls[0];
  const showPhoto = photo !== undefined && !photoBroken;
  const rows = sessions.slice(0, ROWS);

  return (
    <aside
      aria-label={FOCUS.eyebrow}
      className="relative overflow-hidden rounded-[24px] border border-plate-ink/[0.06] bg-card text-ink shadow-deep"
    >
      {/* Фото 200 с затемнением снизу (макет 410-417); без клуба — тёмная зона с пустым состоянием. */}
      <div className="grid h-[200px] grid-rows-[200px] bg-plate">
        {club && showPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element -- адрес фото из данных, размер фиксирован
          <img
            src={photo}
            alt=""
            onError={() => setPhotoBroken(true)}
            className="h-full w-full [grid-area:1/1] object-cover"
          />
        ) : club ? (
          <div className="hero-bg-blank flex items-center justify-center [grid-area:1/1] bg-card-2">
            <span className="font-body text-[11px] font-bold uppercase tracking-[0.28em] text-muted">
              {FOCUS.photoFallback}
            </span>
          </div>
        ) : null}
        <div
          aria-hidden="true"
          className="pointer-events-none [grid-area:1/1] [background:var(--ui-decor-photo-shade)]"
        />

        {club?.verifiedAt ? (
          <span className="absolute left-3 top-3 rounded-[5px] bg-lime px-2 py-[3px] font-body text-[9px] font-extrabold uppercase leading-none text-ink">
            {FOCUS.verified}
          </span>
        ) : null}

        <div className="flex flex-col justify-end [grid-area:1/1] px-4 pb-3.5 pt-4 text-plate-ink">
          <h3 className="m-0 font-display text-[20px] font-black leading-none">
            {club?.name ?? FOCUS.emptyTitle}
          </h3>
          {club ? (
            <div className="mt-1 flex items-center gap-1.5 text-[10px] text-plate-muted">
              <span
                role="img"
                aria-label={`Рейтинг: ${club.rating.toFixed(1)} из 5`}
                className="inline-flex items-center gap-1.5"
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="size-[11px] fill-current text-lime"
                >
                  <path d="m12 3.2 2.72 5.52 6.09.89-4.4 4.29 1.04 6.07L12 17.09l-5.45 2.88 1.04-6.07-4.4-4.29 6.09-.89L12 3.2Z" />
                </svg>
                <span className="font-mono text-[12px] font-bold tabular-nums text-plate-ink">
                  {club.rating.toFixed(1)}
                </span>
              </span>
              <span>
                ({club.reviewCount}) · {club.address}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Расписание: заголовок 13 800 капителью, до трёх строк, как в макете (429-455). */}
      <div className="px-4 pb-4 pt-3.5">
        <p className="m-0 mb-2.5 font-display text-[13px] font-extrabold uppercase tracking-[0.06em]">
          {FOCUS.upcoming}
        </p>
        {rows.length === 0 ? (
          <p className="m-0 font-body text-[12px] text-muted">{FOCUS.emptyHint(dateLabel)}</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {rows.map((session, index) => (
              <li
                key={session.id}
                className={cn(
                  'flex items-center gap-3 py-2.25',
                  index < rows.length - 1 && 'border-b border-line',
                )}
              >
                <span className="w-10 shrink-0 font-mono text-[13px] font-extrabold tabular-nums">
                  {session.startTime}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-body text-[12px] font-bold">
                    {session.title}
                  </span>
                  <span className="block truncate font-body text-[10px] text-muted">
                    {session.trainerName ?? session.clubName}
                  </span>
                </span>
                <Button
                  href={`/booking/${session.id}`}
                  aria-label={`${FOCUS.cta}: ${session.title}, ${session.startTime}`}
                  variant={rowButtonVariant(index, session.availableSpots)}
                  size="xs"
                  className="shrink-0"
                >
                  {index === 0 ? (
                    FOCUS.cta
                  ) : (
                    <>
                      {isLowSpots(session.availableSpots) ? (
                        <span aria-hidden="true">🔥 </span>
                      ) : null}
                      {spotsLabel(session.availableSpots)}
                    </>
                  )}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
