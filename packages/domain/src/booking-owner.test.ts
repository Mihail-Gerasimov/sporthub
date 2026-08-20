// Тесты резолва владельца записи и производного guard'а «мой ли это клиент».
// Отдельно закрыт легаси-формат `ownerType`/`ownerId` без явных clubId/trainerId:
// именно на нём фронт и бэкенд до Phase 33 отвечали по-разному.
import { describe, expect, it } from 'vitest';

import type { Booking } from '@sporthub/types';

import {
  getBookingClubId,
  getBookingTrainerId,
  isClientOfProvider,
  type BookingOwnerRef,
  type ManagedEntityRef,
} from './booking-owner';

const PROVIDER_USER_ID = 2;
const OTHER_PROVIDER_USER_ID = 99;
const CLIENT_USER_ID = 1;

const providerClub: ManagedEntityRef = { id: 10, managedByUserId: PROVIDER_USER_ID };
const foreignClub: ManagedEntityRef = { id: 20, managedByUserId: OTHER_PROVIDER_USER_ID };
const providerTrainer: ManagedEntityRef = { id: 30, managedByUserId: PROVIDER_USER_ID };

/** Запись минимального вида: только те поля, которые читает guard. */
function makeBooking(
  patch: BookingOwnerRef & Partial<Pick<Booking, 'userId'>>,
): BookingOwnerRef & Pick<Booking, 'userId'> {
  return { userId: CLIENT_USER_ID, ...patch };
}

describe('getBookingClubId', () => {
  it('берёт явный clubId', () => {
    expect(getBookingClubId({ clubId: 10 })).toBe(10);
  });

  it('выводит клуб из ownerType/ownerId, когда явного clubId нет', () => {
    expect(getBookingClubId({ ownerType: 'club', ownerId: 7 })).toBe(7);
  });

  it('не выводит клуб из владельца-тренера', () => {
    expect(getBookingClubId({ ownerType: 'trainer', ownerId: 7 })).toBeNull();
  });

  it('возвращает null, когда клуб не определить', () => {
    expect(getBookingClubId({})).toBeNull();
  });
});

describe('getBookingTrainerId', () => {
  it('берёт явный trainerId', () => {
    expect(getBookingTrainerId({ trainerId: 30 })).toBe(30);
  });

  it('выводит тренера из ownerType/ownerId, когда явного trainerId нет', () => {
    expect(getBookingTrainerId({ ownerType: 'trainer', ownerId: 30 })).toBe(30);
  });

  it('не выводит тренера из владельца-клуба', () => {
    expect(getBookingTrainerId({ ownerType: 'club', ownerId: 30 })).toBeNull();
  });

  it('возвращает null, когда тренера не определить', () => {
    expect(getBookingTrainerId({})).toBeNull();
  });
});

describe('isClientOfProvider', () => {
  it('признаёт клиентом по записи на клуб провайдера', () => {
    const bookings = [makeBooking({ clubId: providerClub.id })];

    expect(
      isClientOfProvider(
        CLIENT_USER_ID,
        PROVIDER_USER_ID,
        bookings,
        [providerClub],
        [providerTrainer],
      ),
    ).toBe(true);
  });

  it('признаёт клиентом по записи на тренера провайдера', () => {
    const bookings = [makeBooking({ trainerId: providerTrainer.id })];

    expect(
      isClientOfProvider(
        CLIENT_USER_ID,
        PROVIDER_USER_ID,
        bookings,
        [providerClub],
        [providerTrainer],
      ),
    ).toBe(true);
  });

  it('признаёт клиентом по легаси-записи с ownerType=club и без clubId', () => {
    const bookings = [makeBooking({ ownerType: 'club', ownerId: providerClub.id })];

    expect(
      isClientOfProvider(
        CLIENT_USER_ID,
        PROVIDER_USER_ID,
        bookings,
        [providerClub],
        [providerTrainer],
      ),
    ).toBe(true);
  });

  it('признаёт клиентом по легаси-записи с ownerType=trainer и без trainerId', () => {
    const bookings = [makeBooking({ ownerType: 'trainer', ownerId: providerTrainer.id })];

    expect(
      isClientOfProvider(
        CLIENT_USER_ID,
        PROVIDER_USER_ID,
        bookings,
        [providerClub],
        [providerTrainer],
      ),
    ).toBe(true);
  });

  it('не признаёт клиентом по записи на чужой клуб', () => {
    const bookings = [makeBooking({ clubId: foreignClub.id })];

    expect(
      isClientOfProvider(
        CLIENT_USER_ID,
        PROVIDER_USER_ID,
        bookings,
        [providerClub, foreignClub],
        [providerTrainer],
      ),
    ).toBe(false);
  });

  it('не признаёт клиентом чужую запись на клуб провайдера', () => {
    const bookings = [makeBooking({ userId: 42, clubId: providerClub.id })];

    expect(
      isClientOfProvider(
        CLIENT_USER_ID,
        PROVIDER_USER_ID,
        bookings,
        [providerClub],
        [providerTrainer],
      ),
    ).toBe(false);
  });

  it('отвечает false, когда провайдер ничем не управляет', () => {
    const bookings = [makeBooking({ clubId: providerClub.id })];

    expect(isClientOfProvider(CLIENT_USER_ID, PROVIDER_USER_ID, bookings, [], [])).toBe(false);
  });
});
