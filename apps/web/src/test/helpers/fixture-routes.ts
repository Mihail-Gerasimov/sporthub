// Таблица «адрес бэкенда → тело ответа» на общих фикстурах.
//
// Здесь НЕТ отбора, сортировок и приведений — только соответствие адреса и набора
// данных. Всё, что умеет бэкенд, проверяется его собственными тестами и сверкой
// контрактов; тестам страниц нужно ровно одно — предсказуемое тело ответа.
//
// Отдельно про записи: адрес `/bookings` отвечает одним и тем же набором независимо
// от строки запроса. Это не упущение. Правильность самого запроса проверяется не телом
// ответа, а списком обращений (`stub.callTo('/bookings')`): страница обязана спросить
// свой срез, и именно это утверждение и должно падать, если срез съедет.

import {
  fixtureAmenities,
  fixtureBookings,
  fixtureCities,
  fixtureClub,
  fixtureClub2,
  fixtureClub3,
  fixtureClubOffering,
  fixtureClubSlot1,
  fixtureClubSlot2,
  fixtureClubSlot3,
  fixtureReviews,
  fixtureSpecialties,
  fixtureSports,
  fixtureTags,
  fixtureTrainer,
  fixtureTrainer3,
  fixtureTrainer5,
  fixtureConfirmedLinkCollections,
  fixtureTrainerOffering,
  fixtureTrainerSlot,
  fixtureUsers,
  fixtureWorkFormats,
} from '@sporthub/fixtures';

import type { ApiRoutes } from './api-stub';

export const fixtureClubs = [fixtureClub, fixtureClub2, fixtureClub3];
export const fixtureTrainers = [fixtureTrainer, fixtureTrainer3, fixtureTrainer5];
export const fixtureOfferings = [fixtureClubOffering, fixtureTrainerOffering];
export const fixtureClubSchedule = [fixtureClubSlot1, fixtureClubSlot2, fixtureClubSlot3];
export const fixtureTrainerSchedule = [fixtureTrainerSlot];
export const fixtureSchedule = [...fixtureClubSchedule, ...fixtureTrainerSchedule];

/**
 * Базовый набор ответов. Тест дополняет и переопределяет его своими адресами —
 * карточками по адресу-ссылке, контекстом слота, пустыми коллекциями.
 *
 * Ключи расписания заданы вместе со строкой запроса: страница спрашивает клубные
 * и тренерские слоты РАЗНЫМИ запросами, и отвечать на них одним набором значило бы
 * скрыть подмену одного другим.
 */
export function createFixtureRoutes(): ApiRoutes {
  return {
    '/sports': fixtureSports,
    '/cities': fixtureCities,
    '/tags': fixtureTags,
    '/amenities': fixtureAmenities,
    '/specialties': fixtureSpecialties,
    '/work-formats': fixtureWorkFormats,
    '/clubs': fixtureClubs,
    '/clubs?includeHidden=true': fixtureClubs,
    '/trainers': fixtureTrainers,
    '/trainers?includeHidden=true': fixtureTrainers,
    '/offerings': fixtureOfferings,
    '/schedule?ownerType=club&includeFull=true': fixtureClubSchedule,
    '/schedule?ownerType=trainer&includeFull=true': fixtureTrainerSchedule,
    '/schedule?ownerType=all&includeFull=true': fixtureSchedule,
    '/reviews': fixtureReviews,
    '/users': fixtureUsers,
    '/bookings': fixtureBookings,
    // Подтверждённая связь тренера с клубом: на ней держатся списки тренеров клуба
    // и площадка тренерских занятий. Берётся из общего набора, а не объявляется здесь,
    // иначе фикстура связи оказалась бы в двух местах и разошлась при первой правке.
    '/trainer-club-links': fixtureConfirmedLinkCollections['trainer-club-links'],
    '/provider-client-notes': [],
    '/notifications': { items: [] },
  };
}
