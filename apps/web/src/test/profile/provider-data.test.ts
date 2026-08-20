// Тесты данных и типов для провайдер-кабинета (Step 12.1, обновлено Phase 14).
//
// Данные берутся из `@sporthub/fixtures`, а не из файлов каталога: фронт больше
// не знает, где они лежат.
import { describe, expect, expectTypeOf, it } from 'vitest';

import type { Club, EntityId, Trainer } from '@sporthub/types';
import {
  fixtureBookings,
  fixtureClub,
  fixtureClub2,
  fixtureClub3,
  fixtureTrainer,
  fixtureTrainer3,
  fixtureTrainer5,
  fixtureUsers,
} from '@sporthub/fixtures';

const clubs = [fixtureClub, fixtureClub2, fixtureClub3];
const trainers = [fixtureTrainer, fixtureTrainer3, fixtureTrainer5];

describe('Provider data layer (Step 12.1)', () => {
  it('Club и Trainer имеют опциональное поле managedByUserId', () => {
    expectTypeOf<Club>().toMatchTypeOf<{ managedByUserId?: EntityId }>();
    expectTypeOf<Trainer>().toMatchTypeOf<{ managedByUserId?: EntityId }>();
  });

  it('в наборе есть provider-пользователь с id: 2', () => {
    const provider = fixtureUsers.find((user) => user.id === 2);

    expect(provider).toBeDefined();
    expect(provider!.name).toBeTruthy();
    expect(provider!.email).toBeTruthy();
  });

  it('клубы 1 и 2 привязаны к провайдеру (managedByUserId: 2)', () => {
    const managedIds = clubs
      .filter((club) => club.managedByUserId === 2)
      .map((club) => club.id)
      .sort();

    expect(managedIds).toEqual([1, 2]);
  });

  it('тренеры 1, 3, 5 привязаны к провайдеру (managedByUserId: 2)', () => {
    const managedIds = trainers
      .filter((trainer) => trainer.managedByUserId === 2)
      .map((trainer) => trainer.id)
      .sort();

    expect(managedIds).toEqual([1, 3, 5]);
  });

  it('в наборе есть минимум 3 записи для демонстрации', () => {
    expect(fixtureBookings.length).toBeGreaterThanOrEqual(3);
  });

  it('записи набора имеют разные статусы', () => {
    expect(new Set(fixtureBookings.map((booking) => booking.status)).size).toBeGreaterThanOrEqual(
      2,
    );
  });
});
