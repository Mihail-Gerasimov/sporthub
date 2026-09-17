// Витринные секции главной «Клубы» и «Тренеры» (шаги 38.79b, 38.106) — макет
// `HomePage.tsx:582-692`: секция 72px по вертикали с верхней линией (у тренеров —
// на белом), рубрика, заголовок, справа «Все …», ниже карточки — сеткой макета
// (с 768 две в ряд, с 1024 клубы 3×2, тренеры четыре), на телефоне — той же лентой `CardSlider`
// со свайпом (`gridFrom`), один компонент. Серверные: стора им не нужно —
// заголовки без города (ревью О-2: витринный запрос города не знает).
//
// Витрина, а не выдача: шесть клубов и четыре тренера приходят запросом
// (`sort=rating&limit=N`, `load-home-data.ts`), фильтров стора карусели не знают —
// отбор под фильтр живёт на `/catalog`. Карточки — те же, что в каталоге
// (`ClubCard`, `TrainerCard`), в режиме `showcase` — карточки макета без хвоста
// (38.104, 38.105), на одном `ui/CardSlider` (сторож `carousel-single`).
//
// Почему не компоненты `ui` целиком: карусель и карточки — уже `ui`; своя здесь
// только секция с якорем словаря и ссылка «Все …», ставящая режим стора.

import { ClubCard } from '@/components/clubs';
import { HomeContainer } from '@/components/home/HomeContainer';
import { ShowcaseAllLink } from '@/components/home/ShowcaseAllLink';
import { TrainerCard } from '@/components/trainers';
import { CardSlider } from '@/components/ui';
import { SHOWCASE } from '@/lib/home-copy';
import { HOME_SECTIONS } from '@/lib/home-sections';

import type { HomeSectionProps } from '@/components/home/home-data';

/** Заголовок в две строки, как в макете (`<br/>`): каждая строка — блочный span одного h2. */
function TitleLines({ lines }: { lines: readonly string[] }) {
  return (
    <>
      {lines.map((line) => (
        <span key={line} className="block">
          {line}
        </span>
      ))}
    </>
  );
}

export function HomeClubs({ data }: HomeSectionProps) {
  return (
    <section
      id={HOME_SECTIONS.clubs.id}
      aria-label={HOME_SECTIONS.clubs.label}
      className="border-t border-line py-[72px]"
    >
      <HomeContainer>
        <CardSlider
          eyebrow={SHOWCASE.clubs.eyebrow}
          title={<TitleLines lines={SHOWCASE.clubs.titleLines} />}
          accent="lime"
          sliderId="showcase-clubs"
          total={data.showcaseClubs.length}
          visibleByBp={{ sm: 1 }}
          gridFrom={{ md: 2, lg: 3 }}
          emptyMessage={SHOWCASE.clubs.empty}
          tools={<ShowcaseAllLink mode="clubs">{SHOWCASE.clubs.all}</ShowcaseAllLink>}
        >
          {data.showcaseClubs.map((club) => (
            <ClubCard key={club.id} club={club} sports={data.sports} variant="showcase" />
          ))}
        </CardSlider>
      </HomeContainer>
    </section>
  );
}

export function HomeTrainers({ data }: HomeSectionProps) {
  return (
    <section
      id={HOME_SECTIONS.trainers.id}
      aria-label={HOME_SECTIONS.trainers.label}
      className="border-t border-line bg-card py-[72px]"
    >
      <HomeContainer>
        <CardSlider
          eyebrow={SHOWCASE.trainers.eyebrow}
          title={<TitleLines lines={SHOWCASE.trainers.titleLines} />}
          accent="orange"
          sliderId="showcase-trainers"
          total={data.showcaseTrainers.length}
          visibleByBp={{ sm: 1 }}
          gridFrom={{ md: 2, lg: 4 }}
          emptyMessage={SHOWCASE.trainers.empty}
          tools={<ShowcaseAllLink mode="trainers">{SHOWCASE.trainers.all}</ShowcaseAllLink>}
        >
          {data.showcaseTrainers.map((trainer) => (
            <TrainerCard key={trainer.id} trainer={trainer} variant="showcase" />
          ))}
        </CardSlider>

        {/* Баннер пробного — под тренерами (`HomePage.tsx:667-689`): холст, зелёная обводка
            .25, радиус 14, 16/22; значок-подарок 36 на лайме .1; кнопка — в выдачу тренеров. */}
        <aside
          aria-label={SHOWCASE.trial.title}
          className="mt-9 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-lime/25 bg-bg px-[22px] py-4"
        >
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-lime/10 text-lime-hov"
            >
              <GiftIcon />
            </span>
            <span>
              <span className="block font-body text-[13px] font-bold text-ink">
                {SHOWCASE.trial.title}
              </span>
              <span className="block font-body text-[11px] text-muted">
                {SHOWCASE.trial.subtitle}
              </span>
            </span>
          </div>
          <ShowcaseAllLink mode="trainers" tone="primary">
            {SHOWCASE.trial.cta}
          </ShowcaseAllLink>
        </aside>
      </HomeContainer>
    </section>
  );
}

/** Подарок — `lucide-react` `Gift` (макет, 16px), инлайн: библиотеки значков в проекте нет. */
function GiftIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M12 8v13" />
      <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
      <path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5" />
    </svg>
  );
}
