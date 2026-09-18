/**
 * «Возможности» — секция главной (шаг 38.72; восемь плиток дословно по макету — 38.117, Э14).
 *
 * По эталону (`HomePage.tsx:543-580`): рубрика, H2 в две строки, справа кнопка
 * «Попробовать бесплатно», сетка 4 → 2 (две колонки на любой ширине, четыре с широких);
 * плитка — радиус 16, отступы 20×18, иконка lucide на белом квадрате 44 радиусом 13,
 * у каждой плитки своя подложка на 6 % и значок в тон (`f.color`, `HomePage.tsx:227-236`).
 * Тексты — слово в слово из словаря `FEATURES`.
 *
 * ⚠️ Куда ведёт плитка — по КЛЮЧУ записи словаря, как тон и иконка. Четыре плитки
 * с разделом: запись → слоты каталога, статистика/прогресс/отзывы → кабинет человека
 * (`/profile/me/*` — ссылка вошедшему, гостю модалка входа: `307 → /` был бы тупиком,
 * ревью 38.72). Четыре без раздела — оплата, дневники, маркет, челленджи — ведут
 * на «раздел в разработке» (`COMING_SOON_PATH`, один адрес на все разделы вне фазы):
 * решение заказчика 17.09, а не обещание вслепую. Существование целей стережёт
 * `home-features.test.tsx` тем же способом, что `menu-routes-exist`.
 *
 * Тон плитки: подложки — токены `--ui-tint-*`, значки — `--ui-hue-*` (Основа, 38.110);
 * значки — ГРАФИКА, не текст, яркие цвета макета на белом квадрате допустимы
 * (исключение `ICON_GREEN` в стороже `green-text-on-light`). Заголовок плитки —
 * `.t-h4` словаря (38.109).
 *
 * Кнопка «Попробовать бесплатно»: гостю — модалка регистрации (`openAuthModal`, тем же
 * механизмом, что призыв `HomeCta`); вошедшему регистрироваться некуда — та же кнопка
 * ведёт в его кабинет с подписью словаря.
 *
 * Почему не `ui/Card`: плитка — ссылка или кнопка целиком, а `Card` — `div`;
 * заворачивать `Card` в интерактив значило бы вкладывать ховер поверх ховера.
 * Иконки — из общего файла `lucide-icons` (инлайновые SVG на `currentColor`).
 */
'use client';

import Link from 'next/link';

import { HomeContainer } from '@/components/home/HomeContainer';
import { LUCIDE, type LucideName } from '@/components/home/lucide-icons';
import { Button } from '@/components/ui/Button';
import { catalogSectionHref, type CatalogSectionKey } from '@/lib/catalog-sections';
import { FEATURES } from '@/lib/home-copy';
import { HOME_SECTIONS } from '@/lib/home-sections';
import { cn } from '@/lib/utils';
import { useAuthFaces, useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';

/** Ключ плитки — из словаря: новая плитка без иконки, цели и тона здесь не соберётся. */
type FeatureKey = (typeof FEATURES.items)[number]['key'];

/**
 * Цель плитки: секция каталога (ссылка всем), раздел кабинета человека (ссылка
 * вошедшему, гостю модалка входа) или «раздел в разработке» (ссылка всем).
 */
type FeatureTarget =
  | { section: CatalogSectionKey }
  | { cabinet: `/profile/me/${string}` };

/** Всё, чем плитки отличаются, — одной строкой на ключ: иконка макета, цель, подложка, тон значка. */
type FeatureSpec = {
  icon: LucideName;
  target: FeatureTarget;
  surface: string;
  tone: string;
};

/**
 * Значок «онлайн-записи» — яркий `text-lime`, как `GREEN` макета; остальные — оттенки
 * макета токенами `--ui-hue-*` / `--ui-red` / `--ui-orange`.
 */
const FEATURE_SPECS: Record<FeatureKey, FeatureSpec> = {
  booking: {
    icon: 'calendar',
    target: { section: 'availability' },
    surface: 'bg-tint-lime',
    tone: 'text-lime',
  },
  stats: {
    icon: 'bar-chart-2',
    target: { cabinet: '/profile/me/stats' },
    surface: 'bg-tint-sky',
    tone: 'text-hue-sky',
  },
};

/** Адрес цели — для ссылки. */
function hrefOf(target: FeatureTarget): string {
  if ('section' in target) return catalogSectionHref(target.section);
  return target.cabinet;
}

const TILE_CLASS =
  'block h-full w-full cursor-pointer rounded-[16px] border border-line px-[18px] py-5 text-left text-ink no-underline transition-[border-color] hover:border-lime focus-visible:border-lime focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lime/25';

export function HomeFeatures() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const { primaryCabinet } = useAuthFaces();
  const openAuthModal = useUIStore((state) => state.openAuthModal);

  return (
    // Якорь и подпись — из записи словаря секций (38.66): секция мимо словаря — красный `anchors-exist`.
    <section
      id={HOME_SECTIONS.features.id}
      aria-label={HOME_SECTIONS.features.label}
      className="border-t border-line bg-card py-16 md:py-[72px]"
    >
      <HomeContainer>
        {/* Шапка: рубрика и H2 слева, кнопка справа; на узких — столбиком (макет: flex-wrap). */}
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="m-0 mb-2.5 font-body text-[10px] font-bold uppercase tracking-[0.12em] text-lime-hov">
              {FEATURES.eyebrow}
            </p>
            <h2 id="home-features-title" className="t-h2 m-0 text-ink">
              {FEATURES.titleLines.map((line, index) => (
                <span key={line} className={index === 0 ? undefined : 'block'}>
                  {line}
                </span>
              ))}
            </h2>
          </div>
          {isAuthenticated && primaryCabinet ? (
            <Button href={primaryCabinet.href} size="sm" leadingIcon={LUCIDE['log-in']}>
              {FEATURES.tryFreeAuthenticated}
            </Button>
          ) : (
            <Button size="sm" onClick={openAuthModal} leadingIcon={LUCIDE['log-in']}>
              {FEATURES.tryFree}
            </Button>
          )}
        </div>

        <ul className="m-0 grid list-none grid-cols-2 gap-3.5 p-0 lg:grid-cols-4">
          {FEATURES.items.map((feature) => {
            const spec = FEATURE_SPECS[feature.key];
            const body = (
              <>
                <span
                  className={cn(
                    'mb-3.5 inline-flex size-11 items-center justify-center rounded-[13px] bg-card shadow-card',
                    spec.tone,
                  )}
                >
                  {LUCIDE[spec.icon]}
                </span>
                {/* Заголовок плитки — `.t-h4` словаря (38.109): Inter полужирный 16px обычным регистром. */}
                <span className="t-h4 mb-1.5 block text-ink">{feature.title}</span>
                <span className="block font-body text-[12px] leading-[1.6] text-muted">
                  {feature.body}
                </span>
              </>
            );
            // Гостю раздел кабинета недоступен — вместо ссылки в тупик кнопка входа.
            const guestGate = 'cabinet' in spec.target && !isAuthenticated;

            return (
              <li key={feature.key} className="min-w-0">
                {guestGate ? (
                  <button
                    type="button"
                    onClick={openAuthModal}
                    className={cn(TILE_CLASS, spec.surface)}
                  >
                    {body}
                  </button>
                ) : (
                  <Link href={hrefOf(spec.target)} className={cn(TILE_CLASS, spec.surface)}>
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </HomeContainer>
    </section>
  );
}
