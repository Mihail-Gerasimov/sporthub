// Секция слотов главной из словаря секций (шаг 38.81): занятия дня под фильтрами выдачи.
//
// Тонкая обёртка над `UpcomingSessions`: якорь и подпись — из записи `availability`
// словаря, данные — из `HomeData`. Занятия дня страница отобрала на сервере
// (сегодня, не начались, есть места, по времени); фильтры выдачи и первые N
// секция применяет сама по стору поиска — поэтому она получает каталог клубов
// и справочники, по которым правило выдачи ищет. Отбор в памяти — действующее
// ограничение (долг Д-15), как у карточек рядом.
//
// Почему не `ui/*`: своей разметки у секции нет — только `section` с якорем словаря
// и `HomeContainer`; карусель и карточки внутри — уже `ui/CardSlider` и `ui/SlotCard`
// через `UpcomingSessions`.

import { HomeContainer } from '@/components/home/HomeContainer';
import { UpcomingSessions } from '@/components/schedule';
import { HOME_SECTIONS } from '@/lib/home-sections';

import type { HomeSectionProps } from '@/components/home/home-data';

export function HomeAvailability({ data }: HomeSectionProps) {
  return (
    <section id={HOME_SECTIONS.availability.id} aria-label={HOME_SECTIONS.availability.label}>
      <HomeContainer>
        <UpcomingSessions
          clubs={data.clubs}
          sports={data.sports}
          tags={data.tags}
          dateLabel={data.upcomingSessionsLabel}
          sessions={data.upcomingSessions}
          trainerDateLabel={data.trainerAvailabilityLabel}
          trainerSlots={data.trainerAvailability}
        />
      </HomeContainer>
    </section>
  );
}
