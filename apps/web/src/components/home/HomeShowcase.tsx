// Витринные секции главной «Клубы» и «Тренеры» (шаги 38.79b, 38.106) — макет
// `HomePage.tsx:582-692`: рубрика, заголовок, справа «Все …», ниже карточки —
// с `lg` сеткой (клубы 3×2, тренеры четыре в ряд), ниже `lg` — той же лентой
// `CardSlider` со свайпом (`gridFromLg`), один компонент.
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

export function HomeClubs({ data }: HomeSectionProps) {
  return (
    <section id={HOME_SECTIONS.clubs.id} aria-label={HOME_SECTIONS.clubs.label}>
      <HomeContainer>
        <CardSlider
          eyebrow={SHOWCASE.clubs.eyebrow}
          title={SHOWCASE.clubs.title}
          accent="lime"
          sliderId="showcase-clubs"
          total={data.showcaseClubs.length}
          visibleByBp={{ sm: 1, md: 2 }}
          gridFromLg={3}
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
    <section id={HOME_SECTIONS.trainers.id} aria-label={HOME_SECTIONS.trainers.label}>
      <HomeContainer>
        <CardSlider
          eyebrow={SHOWCASE.trainers.eyebrow}
          title={SHOWCASE.trainers.title}
          accent="orange"
          sliderId="showcase-trainers"
          total={data.showcaseTrainers.length}
          visibleByBp={{ sm: 1, md: 2 }}
          gridFromLg={4}
          emptyMessage={SHOWCASE.trainers.empty}
          tools={<ShowcaseAllLink mode="trainers">{SHOWCASE.trainers.all}</ShowcaseAllLink>}
        >
          {data.showcaseTrainers.map((trainer) => (
            <TrainerCard key={trainer.id} trainer={trainer} variant="showcase" />
          ))}
        </CardSlider>
      </HomeContainer>
    </section>
  );
}
