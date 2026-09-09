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
//
// ⚠️ Оба среза берутся ИМЕНОВАННЫМИ режимами маршрута (`?scope=owner` и
// `?scope=clients`), а не полным срезом площадки. До шага 34.58 здесь стоял именно
// он — в обоих местах: свои записи спрашивались веером `?scope=all&clubId=…`,
// история клиентов — одним `?scope=all`. Пока полный срез отдавался всем, это
// работало; после того как он ушёл под право администратора, кабинет провайдера
// стал отвечать отказом на каждой странице.

import 'server-only';

import { cache } from 'react';

import { getProviderClubs, getProviderTrainers } from '@/components/profile/provider-helpers';
import { readSession } from '@/lib/session';
import { ATHLETE_RELIABILITY_STATUSES } from '@/lib/booking-scopes';
import {
  getClientBookings,
  getClubs,
  getOwnPublicationBookings,
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

  // Номера публикаций остаются В СРЕЗЕ: по ним страницы делят записи на «клубные»
  // и «тренерские» и рисуют фильтры. А вот в ЗАПРОС они больше не едут — публикации
  // провайдера бэкенд находит сам по владельцу сессии.
  const providerClubIds = getProviderClubs(clubs, userId).map((club) => club.id);
  const providerTrainerIds = getProviderTrainers(trainers, userId).map((trainer) => trainer.id);
  const bookings = await getOwnPublicationBookings();

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
 * Сузить такую историю по одному человеку за запрос нечем: клиентов у клуба бывают
 * сотни, и вместо одного запроса вышли бы сотни. Поэтому у бэкенда есть свой срез —
 * `?scope=clients`: он сам находит публикации спрашивающего и отдаёт историю тех,
 * кто к ним записывался, одним условием запроса.
 *
 * ⚠️ До шага 34.58 здесь стоял срез ВСЕЙ площадки (`?scope=all`). Он и правда
 * содержал нужное — вместе с записями всех посторонних людей; а после того, как
 * этот режим ушёл под право администратора, оба раздела перестали открываться
 * вовсе: страница получала отказ и падала целиком. Новый срез отдаёт ровно
 * недостающее и никому, кроме самого провайдера, ничего не показывает.
 *
 * Статусы сужены до трёх из восьми — ровно тех, которые читает расчёт надёжности.
 */
export const loadProviderScopeWithClientHistory = cache(async (): Promise<ProviderScope> => {
  const scope = await loadProviderScope();

  if (scope.userId === null) return scope;

  const clientHistory = await getClientBookings({ status: ATHLETE_RELIABILITY_STATUSES });

  return { ...scope, bookings: mergeBookingsById(scope.bookings, clientHistory) };
});
