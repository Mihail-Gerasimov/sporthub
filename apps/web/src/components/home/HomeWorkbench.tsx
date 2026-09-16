// Подборка «лучшие по рейтингу» главной из словаря секций (шаг 38.66; отбор — 38.79).
//
// ⚠️ 38.79a: рабочая часть — поиск, карта, выдача, слоты — переехала на `/catalog`
// (`components/catalog/*`); здесь осталась подборка под фильтр, которую шаг 38.79b
// снимает по решению заказчика 16.09 (карусели витрины «Клубы» / «Тренеры»).
// Тонкая обёртка: данные дня — из `HomeData`, отбор в памяти (долг Д-15), корень
// с якорем словаря — здесь (прежний блок корня с id не имел).

import { PopularNearby } from '@/components/clubs';
import { HomeContainer } from '@/components/home/HomeContainer';

import type { HomeSectionProps } from '@/components/home/home-data';
import { HOME_SECTIONS } from '@/lib/home-sections';

export function HomePopular({ data }: HomeSectionProps) {
  return (
    <section id={HOME_SECTIONS.popular.id} aria-label={HOME_SECTIONS.popular.label}>
      <HomeContainer>
        <PopularNearby
          clubs={data.clubs}
          sports={data.sports}
          tags={data.tags}
          trainers={data.trainerDirectory}
        />
      </HomeContainer>
    </section>
  );
}
