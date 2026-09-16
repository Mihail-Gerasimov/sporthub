/**
 * Карточка выбранной точки внизу карты (шаг 38.80) — по эталону (`App.tsx:1467-1490`):
 * белая, радиус 16, плавающая тень, картинка 56×56, имя display-шрифтом, знак
 * проверки, адрес, рейтинг со звездой и «от цены», справа — «Подробнее» и «Закрыть».
 * Заменяет прежний попап маркера (реестр № 71): путь к странице сохранён ссылкой
 * `/clubs/{slug}` или `/trainers/{slug}` — ссылка, а не переход по клику на всё.
 *
 * Почему не `ui/Card`: та — карточка потока с наведением; эта — слой над картой
 * с собственным положением и без ховера.
 */
import { Button, VerifiedBadge } from '@/components/ui';
import type { MapMarkerData } from '@/components/map/useMapMarkers';
import { formatPrice } from '@/lib/utils';

type MapActiveCardProps = {
  marker: MapMarkerData;
  onClose: () => void;
};

/** Адрес страницы публикации по виду маркера. */
function detailHref(marker: MapMarkerData): string {
  return marker.type === 'club' ? `/clubs/${marker.slug}` : `/trainers/${marker.slug}`;
}

/** Звезда рейтинга — зелёная заливка; тёмно-зелёный: яркий lime на белом не читается. */
function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3 fill-current text-lime-hov">
      <path d="m12 3.2 2.72 5.52 6.09.89-4.4 4.29 1.04 6.07L12 17.09l-5.45 2.88 1.04-6.07-4.4-4.29 6.09-.89L12 3.2Z" />
    </svg>
  );
}

/**
 * Заглушка картинки: булавка на подложке, когда фото у публикации нет.
 * STUB: загрузки фото на площадке нет (долг Д-10) — у большинства публикаций
 * `imageUrls` пуст и `avatarUrl` пустой; с появлением загрузки заглушка остаётся
 * честным пустым состоянием, а не снимается.
 */
function ImageFallback() {
  return (
    <span
      aria-hidden="true"
      className="flex size-14 shrink-0 items-center justify-center rounded-[10px] bg-card-2 text-muted"
    >
      <svg viewBox="0 0 24 24" className="size-5">
        <path
          d="M12 21c-1.6-2-6-7.3-6-11a6 6 0 1 1 12 0c0 3.7-4.4 9-6 11Z"
          fill="none"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
        <circle cx="12" cy="10" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    </span>
  );
}

export function MapActiveCard({ marker, onClose }: MapActiveCardProps) {
  return (
    <aside
      aria-label="Выбрано на карте"
      className="absolute bottom-5 left-1/2 z-20 flex w-[calc(100%-40px)] max-w-[400px] -translate-x-1/2 items-center gap-3.5 rounded-[16px] border border-line bg-card px-[18px] py-3.5 shadow-floating"
    >
      {marker.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- внешний адрес картинки, размер фиксирован
        <img
          src={marker.imageUrl}
          alt={marker.name}
          className="size-14 shrink-0 rounded-[10px] object-cover"
        />
      ) : (
        <ImageFallback />
      )}

      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
          <h3 className="t-h4 truncate text-ink">{marker.name}</h3>
          {marker.verifiedAt ? <VerifiedBadge ownerType={marker.type} /> : null}
        </div>
        <p className="truncate font-body text-[11px] text-muted">{marker.address}</p>
        <div className="mt-1 flex items-center gap-2.5">
          {marker.rating > 0 ? (
            <span className="inline-flex items-center gap-[3px] font-display text-[13px] tabular-nums text-ink">
              <StarIcon />
              {marker.rating.toFixed(1)}
            </span>
          ) : null}
          <span className="font-display text-[14px] tabular-nums tracking-[0.02em] text-lime-hov">
            от {formatPrice(marker.priceFrom)}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-1.5">
        <Button href={detailHref(marker)} size="xs">
          Подробнее
        </Button>
        <Button variant="outline" size="xs" onClick={onClose}>
          Закрыть
        </Button>
      </div>
    </aside>
  );
}
