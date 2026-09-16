// Данные дня главной — что страница загружает один раз и отдаёт каждой секции (38.66).
//
// Только типы: секции витрины читают своё из `HomeData` и не ходят за данными сами.
// Здесь, а не в `lib/home-sections.ts`: тот словарь едет в клиентский бандл шапки,
// а типы компонентов каталога ему не нужны.

import type { TrainerAvailabilityItem, TrainerDirectoryItem } from '@/components/trainers';
import type { UpcomingSessionItem } from '@/components/schedule';
import type { Club, PlatformOverview, Sport, Tag, Trainer } from '@sporthub/types';

/** Вид спорта в том виде, в каком его читают фильтры и карточки главной. */
export type HomeSport = Pick<Sport, 'id' | 'name' | 'icon'>;

export type HomeData = {
  /** Четыре числа героя — `GET /api/stats/overview`, четыре `count` на бэкенде (38.30). */
  overview: PlatformOverview;
  /** Полный каталог клубов — рабочая часть фильтрует в памяти (Д-15). */
  clubs: Club[];
  sports: HomeSport[];
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
  /** Лидеры каталога — запросом `sort=rating&limit=1`; пусто — каталог пуст. */
  featuredClub?: Club;
  featuredTrainer?: Trainer;
  /** Подпись услуги лидера-тренера: из справочника, иначе биография. */
  featuredTrainerTitle?: string;
};

/** Входные свойства секции: одни и те же данные дня у каждой. */
export type HomeSectionProps = { data: HomeData };
