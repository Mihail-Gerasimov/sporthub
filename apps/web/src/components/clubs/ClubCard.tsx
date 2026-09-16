'use client';

/*
 * ClubCard — карточка клуба по эталону витрины (фаза 38, шаги 38.73 и 38.104;
 * `HomePage.tsx:78-118` «Топовые залы», чек-лист эталона step-39…43).
 *
 * Два режима одной карточки (`variant`):
 * - `showcase` — фото-плитка макета на главной: фото 180 с затемнением снизу
 *   (токен `--ui-decor-photo-shade`), на нём имя display-шрифтом 19, звезда 10px
 *   и рейтинг, число отзывов; слева сверху — категория (первый вид спорта) и знак
 *   «проверено», справа — плашка «от N». Больше ничего: описание, адрес и теги
 *   остаются в API и на детальной странице (решение заказчика 16.09, Э13).
 * - `catalog` (по умолчанию, выдача `/catalog`) — та же плитка плюс наше ниже фото:
 *   описание, адрес, бейдж «Новый» без рейтинга, лента тегов.
 *
 * Логика — наша (реестр № 86–94): вся карточка ведёт на СТРАНИЦУ клуба
 * (`/clubs/{slug}`), а не в общий каталог, как в макете, — ссылка с именем растянута
 * псевдоэлементом на всю карточку, обёртки `<a>` вокруг `<article>` нет (вложенные
 * ссылки внутри были бы невалидны). Расстояние не рисуется ни в одном режиме:
 * геолокации у площадки нет, «0.0 км» было фальшивым числом (Д-17). Знак
 * «проверено» — по `verifiedAt` (38.52). Ротация тона и водяной знак сняты.
 *
 * Фото — `imageUrls[0]`; без адреса или при ошибке загрузки — заглушка «Фото клуба»
 * на штриховке. STUB: загрузки фото на площадке нет (долг Д-10), заглушка стоит,
 * пока владелец не сможет загрузить снимок; тогда пустой `imageUrls` станет редкостью.
 */
import Link from 'next/link';
import { useState } from 'react';

import { ChipMarquee, VerifiedBadge } from '@/components/ui';
import { buildDictMap, cn, formatPrice } from '@/lib/utils';
import type { Club, Sport, Tag } from '@sporthub/types';

type ClubCardSport = Pick<Sport, 'id' | 'name' | 'icon'>;

/** Режим карточки: витрина главной — только плитка фото; каталог — плитка и хвост. */
export type ClubCardVariant = 'catalog' | 'showcase';

type ClubCardProps = {
  club: Club;
  sports: ClubCardSport[];
  /** Справочник тегов для резолвинга tagIds → имена в marquee (только `catalog`). */
  tags?: Tag[];
  /** Подсветка карточки при выборе на карте — зелёная рамка вместо обычной. */
  highlighted?: boolean;
  variant?: ClubCardVariant;
};

export function ClubCard({
  club,
  sports,
  tags = [],
  highlighted = false,
  variant = 'catalog',
}: ClubCardProps) {
  const [photoBroken, setPhotoBroken] = useState(false);
  const photo = club.imageUrls[0];
  const showPhoto = photo !== undefined && !photoBroken;
  const sportById = buildDictMap(sports);
  const category = club.sportIds.map((id) => sportById.get(id)?.name).find(Boolean);
  const tagItems = buildDictMap(tags);
  const tagChips = club.tagIds.flatMap((id) => {
    const name = tagItems.get(id)?.name;

    return name === undefined ? [] : [{ label: name }];
  });
  // «Новый» — ни рейтинга, ни отзывов: звезде нечего показывать.
  const isNew = club.reviewCount === 0 && club.rating === 0;

  return (
    <article
      data-testid="club-card"
      data-variant={variant}
      data-highlighted={highlighted ? 'true' : 'false'}
      aria-label={`Карточка клуба: ${club.name}`}
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-[18px] border bg-card shadow-card transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-1 hover:shadow-floating',
        highlighted ? 'border-lime' : 'border-line',
      )}
    >
      {/* Фото 180 с затемнением снизу: низ зоны — тёмная плашка под белым текстом,
          поэтому подложка — `bg-plate`; заглушка без фото кладёт свою светлую сверху.
          `alt=""` — имя стоит рядом ссылкой, диктор читал бы его дважды.

          ⚠️ Зона — grid с одной ячейкой, а не `relative` + `absolute` (правка по
          прогону 38.96): фото, затемнение и текст лежат в одной ячейке и рисуются
          по порядку, без позиционирования. Иначе растянутая ссылка с именем
          (`after:inset-0`) считалась бы от ближайшего позиционированного предка —
          низа фото, — и кликабельными были бы 70px из 350: «вся карточка — ссылка»
          не работала. Единственный позиционированный предок ссылки — сам `article`. */}
      <div className="grid h-[180px] grid-rows-[180px] bg-plate">
        {showPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element -- адрес фото из данных, размер фиксирован
          <img
            src={photo}
            alt=""
            loading="lazy"
            onError={() => setPhotoBroken(true)}
            className="h-full w-full [grid-area:1/1] object-cover opacity-[0.88] transition-opacity duration-200 group-hover:opacity-100"
          />
        ) : (
          <div className="hero-bg-blank flex items-center justify-center [grid-area:1/1] bg-card-2">
            <span className="font-body text-[11px] font-bold uppercase tracking-[0.28em] text-muted">
              Фото клуба
            </span>
          </div>
        )}
        <div
          aria-hidden="true"
          className="pointer-events-none [grid-area:1/1] [background:var(--ui-decor-photo-shade)]"
        />

        {/* Слева сверху — категория и знак проверки; справа — цена. Позиционированы
            от `article`: верх карточки — верх фото. Над растянутой ссылкой (`z-[2]`)
            стоит ТОЛЬКО знак — у него подсказка по наведению; категория и цена лежат
            под ссылкой, иначе клик по ним никуда не вёл (приёмка, проход 1). */}
        <div className="pointer-events-none absolute left-3 right-3 top-3 flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {category ? (
              <span className="rounded-[5px] bg-lime px-2 py-0.5 font-body text-[9px] font-bold text-ink">
                {category}
              </span>
            ) : null}
            {/* Без фокуса: знак стоит раньше ссылки с именем, второй стоп до неё сбивал бы порядок. */}
            {club.verifiedAt ? (
              <span className="pointer-events-auto relative z-[2]">
                <VerifiedBadge ownerType="club" focusable={false} />
              </span>
            ) : null}
          </div>
          <span className="shrink-0 rounded-[8px] bg-plate/80 px-2.5 py-1 font-display text-[12px] font-extrabold tabular-nums text-plate-ink">
            от {formatPrice(club.priceFrom)}
          </span>
        </div>

        {/* Снизу — имя (ссылка на всю карточку), рейтинг, отзывы, расстояние. */}
        <div className="flex flex-col justify-end [grid-area:1/1] px-4 py-3.5">
          {/* Имя: в витрине — Inter полужирный обычным регистром (38.109, решение заказчика
              по сверке бок о бок); в каталоге — display, как было. */}
          <h3
            className={cn(
              'm-0 text-[19px] leading-none text-plate-ink',
              variant === 'showcase' ? 'font-body font-bold' : 'font-display font-black',
            )}
          >
            <Link
              href={`/clubs/${club.slug}`}
              className="no-underline after:absolute after:inset-0 after:z-[1] after:content-['']"
            >
              {club.name}
            </Link>
          </h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-plate-muted">
            {isNew ? (
              <span
                data-testid="club-card-new-badge"
                className="rounded-[5px] border border-plate-line px-1.5 py-px font-body font-bold uppercase tracking-[0.14em] text-plate-ink"
              >
                Новый
              </span>
            ) : (
              <>
                <span
                  role="img"
                  aria-label={`Рейтинг: ${club.rating.toFixed(1)} из 5`}
                  className="inline-flex items-center gap-1.5"
                >
                  {/* Звезда 10px, зелёная на тёмном затемнении фото — как в макете. */}
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="size-2.5 fill-current text-lime"
                  >
                    <path d="m12 3.2 2.72 5.52 6.09.89-4.4 4.29 1.04 6.07L12 17.09l-5.45 2.88 1.04-6.07-4.4-4.29 6.09-.89L12 3.2Z" />
                  </svg>
                  <span className="font-display text-[11px] font-bold tabular-nums text-plate-ink">
                    {club.rating.toFixed(1)}
                  </span>
                </span>
                <span>({club.reviewCount})</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Ниже фото — наше, только в каталоге: описание, адрес, лента тегов — под
          растянутой ссылкой, декоративная (без drag и паузы): клик ведёт на клуб. */}
      {variant === 'catalog' ? (
        <>
          <p className="m-0 line-clamp-3 px-4 pt-3.5 font-body text-[13px] leading-[1.6] text-muted">
            {club.shortDescription}
          </p>
          <p className="m-0 px-4 pt-2 font-body text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            {club.address}
          </p>
          <div className="mt-auto">
            <ChipMarquee
              items={tagChips}
              variant="solid"
              accent="lime"
              isLast
              interactive={false}
            />
          </div>
        </>
      ) : null}
    </article>
  );
}
