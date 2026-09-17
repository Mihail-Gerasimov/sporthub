/**
 * Отбор занятий клубов для витрины и «Сегодня в фокусе» (шаг 38.81).
 *
 * Логика отбора — решение, названное заказчику; рабочая часть считает в памяти
 * по действующему ограничению (долг Д-15):
 *  1. сегодня (`targetDate` — день момента `now` по часам зала);
 *  2. ещё не началось — по часам зала: идущее занятие «не прошло», но записываться
 *     на него поздно;
 *  3. есть свободные места — слот без мест ПРЯЧЕТСЯ; освободилось — вернётся при
 *     следующей загрузке, без специального механизма.
 *  Пункты 1–3 — ОДИН предикат домена `isSlotOpenToday`: тот же, что у окон тренеров
 *  («доступен сейчас»), иначе тренер с окном, начавшимся десять минут назад, был бы
 *  доступен, а клубный слот в той же ситуации — спрятан;
 *  4. те же фильтры, что у выдачи (`filterClubs`: вид спорта, город, запрос) —
 *     слоты клубов, оставшихся в выдаче; при выбранном виде — только слоты ЭТОГО вида,
 *     клуб «йога + бокс» под фильтром «йога» бокс не показывает;
 *  5. по времени начала, при равенстве — по названию;
 *  6. первые N — `APP_LIMITS.upcomingSessions`, одна константа рядом с прочими
 *     размерами витрины.
 *
 * Отбор разрезан по месту исполнения. Пункты 1–3 и 5 — `getUpcomingSessions`,
 * на сервере: расписание не едет в браузер, страница отдаёт секциям уже занятия дня
 * (правая колонка героя берёт их как есть). Пункты 4 и 6 — `applyUpcomingSessionFilters`,
 * в клиентской секции слотов: фильтры живут в сторе поиска, и срез первых N делается
 * ПОСЛЕ них — иначе под чипом «Йога» шестёрка была бы уже урезана до фильтра.
 * Обе функции чистые: момент `now` и фильтры приходят снаружи.
 */
import { APP_LIMITS } from '@sporthub/types';
import { isSlotOpenToday } from '@sporthub/domain';

import { filterClubs, type ClubListSport } from '@/components/clubs/filterClubs';
import { getScheduleClubId } from '@/lib/utils';

import type { Club, EntityId, Schedule, Tag, Trainer } from '@sporthub/types';

export type UpcomingSessionItem = {
  id: EntityId;
  title: string;
  clubId: EntityId;
  clubName: string;
  /** Тренер занятия по справочнику — строка карточки героя (38.116); без справочника пусто. */
  trainerName?: string;
  /** Вид спорта занятия — по нему секция сужает список под выбранный чип. */
  sportId: EntityId;
  date: string;
  startTime: string;
  endTime: string;
  price: number;
  room?: string;
  availableSpots: number;
};

/** Фильтры выдачи — те же поля, что читает `ClubList` из стора поиска. */
export type UpcomingSessionFilters = {
  searchQuery: string;
  selectedSportId: EntityId | null;
  selectedCity: string;
  /** Справочники для правила выдачи: названия видов и тегов входят в поиск по тексту. */
  sports: ClubListSport[];
  tags?: Tag[];
};

type GetUpcomingSessionsInput = {
  clubs: Club[];
  schedule: Schedule[];
  targetDate: string;
  /** Момент «сейчас» — явно: страница передаёт тот же, по которому считает день. */
  now: Date;
  /** Справочник тренеров — только ради имени в строке занятия (38.116); без него имени нет. */
  trainers?: Pick<Trainer, 'id' | 'name'>[];
};

/** Пункты 1–3 и 5: занятия дня, куда ещё можно прийти, ближайшее — первым. Без среза. */
export function getUpcomingSessions({
  clubs,
  schedule,
  targetDate,
  now,
  trainers = [],
}: GetUpcomingSessionsInput): UpcomingSessionItem[] {
  const clubById = new Map(clubs.map((club) => [club.id, club]));
  const trainerNameById = new Map(trainers.map((trainer) => [trainer.id, trainer.name]));

  return (
    schedule
      // Шаги 1–3: сегодня, ещё не началось, есть места — предикат домена.
      // `targetDate` — день того же момента, что и `now`: страница считает его по `now`,
      // и день «сверху» держится ради подписи даты, а не второго правила отбора.
      .filter((slot) => slot.date === targetDate && isSlotOpenToday(slot, now))
      .flatMap((slot) => {
        const clubId = getScheduleClubId(slot);
        const club = clubId === null ? undefined : clubById.get(clubId);

        // Слот клуба, которого нет в каталоге (скрыт, архив), не показывается.
        if (clubId === null || club === undefined) return [];

        return [
          {
            id: slot.id,
            title: slot.title,
            clubId,
            clubName: club.name,
            trainerName:
              slot.trainerId === undefined ? undefined : trainerNameById.get(slot.trainerId),
            sportId: slot.sportId,
            date: slot.date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            price: slot.price,
            room: slot.room,
            availableSpots: slot.capacity - slot.bookedCount,
          } satisfies UpcomingSessionItem,
        ];
      })
      // Шаг 5: по времени начала, ничьи — по названию.
      .sort((left, right) => {
        const byStart = `${left.date}T${left.startTime}`.localeCompare(
          `${right.date}T${right.startTime}`,
        );

        return byStart !== 0 ? byStart : left.title.localeCompare(right.title, 'ru');
      })
  );
}

type ApplyUpcomingSessionFiltersInput = {
  /** Занятия дня из `getUpcomingSessions` — уже отобранные и упорядоченные. */
  sessions: UpcomingSessionItem[];
  /** Каталог клубов — правило выдачи ищет по тексту клуба. */
  clubs: Club[];
  filters: UpcomingSessionFilters;
  limit?: number;
};

/**
 * Пункты 4 и 6: те же фильтры, что у выдачи, затем первые N.
 *
 * Клуб проходит фильтры по правилу выдачи (`filterClubs`); слот клуба, выпавшего
 * из выдачи, выпадает вместе с ним. Под выбранным видом остаются только слоты
 * ЭТОГО вида: клуб «йога + бокс» под чипом «йога» бокс не показывает.
 */
export function applyUpcomingSessionFilters({
  sessions,
  clubs,
  filters,
  limit = APP_LIMITS.upcomingSessions,
}: ApplyUpcomingSessionFiltersInput): UpcomingSessionItem[] {
  const visibleClubIds = new Set(filterClubs({ clubs, ...filters }).map((club) => club.id));
  const { selectedSportId } = filters;

  return sessions
    .filter((session) => visibleClubIds.has(session.clubId))
    .filter((session) => selectedSportId === null || session.sportId === selectedSportId)
    .slice(0, limit);
}
