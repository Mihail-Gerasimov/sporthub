// Вид адресата уведомления: словарь и карта формы строки (шаг 37.4).
//
// ⚠️ Зачем тесты у словаря. Этот словарь — единственный источник и для кода, и для
// ограничения целостности в базе: `scripts/db-constraints.mjs` собирает из карты формы
// выражение CHECK (шаг 37.8). Ошибка здесь не остаётся в TypeScript — она уезжает
// в схему живой базы и начинает пропускать строки, против которых ограничение писалось.

import { describe, expect, it } from 'vitest';

import {
  NOTIFICATION_ADDRESSEE_KINDS,
  NOTIFICATION_ADDRESSEE_LABELS,
  NOTIFICATION_ADDRESSEE_SHAPE,
  isNotificationAddresseeKind,
  type NotificationAddresseeKind,
} from './notification-addressee';

describe('словарь видов адресата', () => {
  it('содержит четыре вида и ни одного лишнего', () => {
    expect([...NOTIFICATION_ADDRESSEE_KINDS]).toEqual([
      'personal',
      'club',
      'trainer',
      'supervision',
    ]);
  });

  it('у каждого вида есть подпись', () => {
    for (const kind of NOTIFICATION_ADDRESSEE_KINDS) {
      expect(NOTIFICATION_ADDRESSEE_LABELS[kind]).toBeTruthy();
    }
  });

  it('узнаёт свои значения и отбраковывает чужие', () => {
    expect(isNotificationAddresseeKind('supervision')).toBe(true);
    // ⚠️ Опечатка в одну букву — ровно то, ради чего проверка существует:
    // такое значение уехало бы в предикат частичного индекса и прошло молча.
    expect(isNotificationAddresseeKind('persona1')).toBe(false);
    expect(isNotificationAddresseeKind('')).toBe(false);
    expect(isNotificationAddresseeKind(undefined)).toBe(false);
    expect(isNotificationAddresseeKind(42)).toBe(false);
  });
});

describe('карта формы строки', () => {
  it('описывает каждый вид адресата', () => {
    for (const kind of NOTIFICATION_ADDRESSEE_KINDS) {
      expect(NOTIFICATION_ADDRESSEE_SHAPE[kind]).toBeDefined();
    }
  });

  it('надзорный ящик — единственный без владельца-человека', () => {
    // Это и есть цена решения 5.2, и она обязана быть видна в наборе, а не
    // подразумеваться: `user_id` перестаёт быть обязательным ровно для одного вида.
    const withoutOwner = NOTIFICATION_ADDRESSEE_KINDS.filter(
      (kind) => !NOTIFICATION_ADDRESSEE_SHAPE[kind].user,
    );

    expect(withoutOwner).toEqual(['supervision']);
  });

  it('ни один вид не заполняет обе колонки лица', () => {
    // Прежнее ограничение `<= 1` держало именно это и только это. Новая карта
    // обязана как минимум не быть слабее прежнего ограничения.
    for (const kind of NOTIFICATION_ADDRESSEE_KINDS) {
      const shape = NOTIFICATION_ADDRESSEE_SHAPE[kind];

      expect(shape.club && shape.trainer).toBe(false);
    }
  });

  it('ровно один вид заполняет колонку клуба и ровно один — колонку карточки', () => {
    const byClub = NOTIFICATION_ADDRESSEE_KINDS.filter(
      (kind) => NOTIFICATION_ADDRESSEE_SHAPE[kind].club,
    );
    const byTrainer = NOTIFICATION_ADDRESSEE_KINDS.filter(
      (kind) => NOTIFICATION_ADDRESSEE_SHAPE[kind].trainer,
    );

    expect(byClub).toEqual(['club']);
    expect(byTrainer).toEqual(['trainer']);
  });

  it('формы всех видов попарно различны', () => {
    // ⚠️ Если две формы совпадут, различить эти виды по колонкам станет нельзя,
    // и ограничение перестанет быть однозначным: строка подойдёт сразу под два
    // дизъюнкта. Именно от этой неоднозначности фаза и уходит.
    const shapes = NOTIFICATION_ADDRESSEE_KINDS.map((kind) =>
      JSON.stringify(NOTIFICATION_ADDRESSEE_SHAPE[kind]),
    );

    expect(new Set(shapes).size).toBe(NOTIFICATION_ADDRESSEE_KINDS.length);
  });

  it('личная строка — это владелец без лица, а не «пустые колонки»', () => {
    const personal: NotificationAddresseeKind = 'personal';

    expect(NOTIFICATION_ADDRESSEE_SHAPE[personal]).toEqual({
      user: true,
      club: false,
      trainer: false,
    });
  });
});
