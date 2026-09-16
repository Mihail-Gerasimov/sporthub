// Данные страницы каталога — что страница загружает один раз и отдаёт каждой секции
// (шаг 38.79a). Только типы: секции читают своё из `CatalogData` и не ходят за
// данными сами. Рабочая часть фильтрует в памяти — действующее ограничение (Д-15).

import type { TrainerAvailabilityItem, TrainerDirectoryItem } from '@/components/trainers';
import type { UpcomingSessionItem } from '@/components/schedule';
import type { Club, Sport, Tag } from '@sporthub/types';

/**
 * Вид спорта в том виде, в каком его читают фильтры, карточки, карта и легенда.
 * `color` — цвет капли на карте (38.80): необязателен, у видов без цвета капля общая.
 */
export type CatalogSport = Pick<Sport, 'id' | 'name' | 'icon' | 'color'>;

export type CatalogData = {
  /** Полный каталог клубов — рабочая часть фильтрует в памяти (Д-15). */
  clubs: Club[];
  sports: CatalogSport[];
  tags: Tag[];
  /** Справочник тренеров с адресом, ценой и ближайшим окном. */
  trainerDirectory: TrainerDirectoryItem[];
  /** Занятия клубов сегодня, ближайшее — первым. */
  upcomingSessions: UpcomingSessionItem[];
  /** Сегодняшняя дата словами: «15 сентября». */
  upcomingSessionsLabel: string;
  /** Свободные окна тренеров и дата ближайшего словами. */
  trainerAvailability: TrainerAvailabilityItem[];
  trainerAvailabilityLabel: string;
};

/** Входные свойства секции каталога: одни и те же данные у каждой. */
export type CatalogSectionProps = { data: CatalogData };
