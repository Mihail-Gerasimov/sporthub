// Данные кабинета провайдера, общие для макета и его страниц.
//
// Две причины, по которым это отдельный модуль, а не по три строки в каждой странице:
//
// 1. **Кто такой «этот провайдер», знает только запрос.** Серверная страница личность
//    вызывающего сама не выводит: она приходит в cookie, которую пишет хранилище входа.
//    Раньше это было неважно — страница забирала записи всей площадки и отдавала
//    клиентской части, а та отбирала свои уже в браузере. Теперь отбор уходит в запрос,
//    и личность нужна ДО него.
// 2. **Макет и страница рендерятся в одном запросе.** Оба показывают одни и те же
//    сведения — макет считает по ним, какие разделы вообще показывать. Два независимых
//    вызова означали бы два одинаковых похода на бэкенд за навигацию; `cache` из React
//    держит их одним на запрос.
//
// ⚠️ Записи здесь — записи ПУБЛИКАЦИЙ провайдера, а не всей площадки. Клиентские части
// продолжают отбирать своё сами, поэтому выдача обязана быть надмножеством того, что
// они оставят: бэкенд считает записью клуба и ту, где клуб — площадка, и это ровно
// то же правило, по которому разбирает запись `getBookingClubId`.

import 'server-only';

import { cache } from 'react';

import { getProviderClubs, getProviderTrainers } from '@/components/profile/provider-helpers';
import { readSession } from '@/lib/session';
import { ATHLETE_RELIABILITY_STATUSES } from '@/lib/booking-scopes';
import {
  getBookingsForOwners,
  getBookingsWhere,
  getClubs,
  getTrainers,
  mergeBookingsById,
} from '@/lib/server-api';
import type { Booking, Club, EntityId, Trainer } from '@sporthub/types';

export type ProviderScope = {
  /** Кто смотрит. Пусто у гостя — клиентская часть покажет отказ в доступе. */
  userId: number | null;
  /** Полные списки публикаций: их показывают и макет, и страницы. */
  clubs: Club[];
  trainers: Trainer[];
  providerClubIds: EntityId[];
  providerTrainerIds: EntityId[];
  /** Записи публикаций провайдера. У гостя — пусто, запрашивать нечего. */
  bookings: Booking[];
};

/**
 * Срез кабинета провайдера. Один поход за запрос — за это отвечает `cache`.
 *
 * Публикации читаются целиком: их немного, они нужны страницам для названий чужих
 * клубов и залов, а сузить их до «своих» нельзя — карточка записи показывает клуб,
 * в котором идёт занятие, даже если он не принадлежит провайдеру.
 */
export const loadProviderScope = cache(async (): Promise<ProviderScope> => {
  const [userId, clubs, trainers] = await Promise.all([
    readSession().then((session) => session?.id ?? null),
    getClubs(),
    getTrainers(),
  ]);

  if (userId === null) {
    return {
      userId: null,
      clubs,
      trainers,
      providerClubIds: [],
      providerTrainerIds: [],
      bookings: [],
    };
  }

  const providerClubIds = getProviderClubs(clubs, userId).map((club) => club.id);
  const providerTrainerIds = getProviderTrainers(trainers, userId).map((trainer) => trainer.id);
  const bookings = await getBookingsForOwners({
    clubIds: providerClubIds,
    trainerIds: providerTrainerIds,
  });

  return { userId, clubs, trainers, providerClubIds, providerTrainerIds, bookings };
});

/**
 * Тот же срез плюс история клиентов провайдера.
 *
 * ⚠️ Разделам «Записи» и «Клиенты» мало записей самого провайдера: рядом с каждым
 * клиентом стоит бейдж его надёжности, а он обязан считаться по ВСЕЙ истории
 * человека, а не по той её части, что пришлась на этого провайдера. Иначе клиент,
 * пропустивший десять занятий у других, выглядел бы у нас безупречным.
 *
 * Сузить такую историю до нужных людей нечем: маршрут отбирает по одному атлету
 * за запрос, а клиентов у клуба бывают сотни — вместо одного запроса вышли бы сотни.
 * Поэтому здесь остаётся срез по площадке, но суженный до трёх статусов из восьми —
 * ровно тех, которые читает расчёт надёжности атлета.
 */
export const loadProviderScopeWithClientHistory = cache(async (): Promise<ProviderScope> => {
  const scope = await loadProviderScope();

  if (scope.userId === null) return scope;

  const clientHistory = await getBookingsWhere({ status: ATHLETE_RELIABILITY_STATUSES });

  return { ...scope, bookings: mergeBookingsById(scope.bookings, clientHistory) };
});
