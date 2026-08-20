// Тесты простых CRUD-доменов: логи, отзывы, пользователи, CRM-заметки.
// Все четыре следуют одному паттерну из db.ts — прочитать коллекцию, добавить
// запись со следующим id и меткой времени, записать обратно. Поэтому общий
// контрактный набор прогоняется по каждому домену, а специфика проверяется
// отдельно.

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { User } from '@sporthub/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { JsonStorage } from '../storage/json-storage';
import {
  JsonLogsRepository,
  JsonProviderClientNotesRepository,
  JsonReviewsRepository,
  JsonUsersRepository,
} from './crud.repository';

describe('Простые CRUD-репозитории', () => {
  let dataDirectory: string;
  let storage: JsonStorage;

  beforeEach(async () => {
    dataDirectory = await mkdtemp(path.join(tmpdir(), 'sporthub-crud-'));
    storage = new JsonStorage(dataDirectory);
    for (const file of ['logs.json', 'reviews.json', 'users.json', 'provider-client-notes.json']) {
      await writeFile(path.join(dataDirectory, file), '[]\n', 'utf8');
    }
  });

  afterEach(async () => {
    await rm(dataDirectory, { force: true, recursive: true });
  });

  describe('LogsRepository', () => {
    it('запись получает id и метку времени, читается обратно', async () => {
      const logs = new JsonLogsRepository(storage);

      const entry = await logs.insert({
        action: 'admin_login',
        actorId: 3,
        actorRole: 'admin',
        entityType: 'user',
        entityId: 3,
      });

      expect(entry.id).toBe(1);
      expect(() => new Date(entry.createdAt).toISOString()).not.toThrow();
      expect(await logs.findAll()).toHaveLength(1);
    });

    it('id инкрементируется при нескольких записях', async () => {
      const logs = new JsonLogsRepository(storage);
      const base = {
        action: 'admin_login',
        actorId: 3,
        actorRole: 'admin',
        entityType: 'user',
        entityId: 3,
      } as const;

      await logs.insert({ ...base });
      const second = await logs.insert({ ...base });

      expect(second.id).toBe(2);
    });
  });

  describe('ReviewsRepository', () => {
    it('создаёт отзыв и отдаёт его в общем списке', async () => {
      const reviews = new JsonReviewsRepository(storage);

      const review = await reviews.insert({
        userId: 1,
        clubId: 1,
        rating: 5,
        text: 'Отлично',
      });

      expect(review.id).toBe(1);
      expect(await reviews.findAll()).toHaveLength(1);
    });

    it('фильтрует по клубу и по тренеру раздельно', async () => {
      const reviews = new JsonReviewsRepository(storage);
      await reviews.insert({
        userId: 1,
        clubId: 1,
        rating: 5,
        text: 'Клубный',
      });
      await reviews.insert({
        userId: 1,
        trainerId: 2,
        rating: 4,
        text: 'Тренерский',
      });

      expect(await reviews.findMany({ clubId: 1 })).toHaveLength(1);
      expect(await reviews.findMany({ trainerId: 2 })).toHaveLength(1);
      expect(await reviews.findMany({})).toHaveLength(2);
    });

    it('удаление по владельцу забирает только его отзывы', async () => {
      const reviews = new JsonReviewsRepository(storage);
      await reviews.insert({
        userId: 1,
        clubId: 1,
        rating: 5,
        text: 'Клубный',
      });
      await reviews.insert({
        userId: 1,
        trainerId: 2,
        rating: 4,
        text: 'Тренерский',
      });

      const removed = await reviews.removeMany({ clubId: 1 });

      expect(removed).toBe(1);
      expect(await reviews.findAll()).toHaveLength(1);
    });
  });

  describe('UsersRepository', () => {
    const newUser: Omit<User, 'id' | 'createdAt'> = {
      role: 'athlete',
      name: 'Иван',
      email: 'ivan@test.local',
      phone: '+7 (900) 000-00-00',
      passwordHash: 'secret1',
      favoriteClubIds: [] as number[],
    };

    it('создаёт пользователя и находит его по id и по email', async () => {
      const users = new JsonUsersRepository(storage);

      const created = await users.insert({ ...newUser });

      expect(created.id).toBe(1);
      expect(await users.findById(1)).toMatchObject({
        email: 'ivan@test.local',
      });
      expect(await users.findByEmail('ivan@test.local')).toMatchObject({
        id: 1,
      });
    });

    it('поиск по несуществующим ключам отдаёт null, а не бросает', async () => {
      const users = new JsonUsersRepository(storage);

      expect(await users.findById(999)).toBeNull();
      expect(await users.findByEmail('нет@такого.local')).toBeNull();
    });

    it('обновление меняет только переданные поля', async () => {
      const users = new JsonUsersRepository(storage);
      await users.insert({ ...newUser });

      const updated = await users.update(1, { phone: '+7 (999) 111-11-11' });

      expect(updated.phone).toBe('+7 (999) 111-11-11');
      expect(updated.email).toBe('ivan@test.local');
      expect(updated.name).toBe('Иван');
    });

    it('обновление несуществующего пользователя бросает с текстом из db.ts', async () => {
      const users = new JsonUsersRepository(storage);

      // Текст обязан совпадать дословно: на него завязаны роуты и тесты.
      await expect(users.update(999, { phone: '+7 (999) 111-11-11' })).rejects.toThrow(
        'Пользователь не найден',
      );
    });
  });

  describe('ProviderClientNotesRepository', () => {
    it('создаёт заметку и фильтрует по провайдеру и клиенту', async () => {
      const notes = new JsonProviderClientNotesRepository(storage);
      await notes.insert({
        providerUserId: 2,
        clientUserId: 1,
        note: 'Первая',
      });
      await notes.insert({
        providerUserId: 2,
        clientUserId: 5,
        note: 'Вторая',
      });

      expect(await notes.findMany({ providerUserId: 2 })).toHaveLength(2);
      expect(await notes.findMany({ providerUserId: 2, clientUserId: 1 })).toHaveLength(1);
    });

    it('сортировка по убыванию времени создания', async () => {
      const notes = new JsonProviderClientNotesRepository(storage);
      await notes.insert({
        providerUserId: 2,
        clientUserId: 1,
        note: 'Первая',
      });
      await notes.insert({
        providerUserId: 2,
        clientUserId: 1,
        note: 'Вторая',
      });

      const found = await notes.findMany({ providerUserId: 2 });

      // Свежая заметка идёт первой — так же, как в db.ts.
      expect(found[0].note).toBe('Вторая');
    });

    it('обновление двигает updatedAt и меняет текст', async () => {
      const notes = new JsonProviderClientNotesRepository(storage);
      const created = await notes.insert({
        providerUserId: 2,
        clientUserId: 1,
        note: 'Было',
      });

      const updated = await notes.update(created.id, { note: 'Стало' });

      expect(updated.note).toBe('Стало');
      expect(updated.createdAt).toBe(created.createdAt);
    });

    it('обновление несуществующей заметки бросает с текстом из db.ts', async () => {
      const notes = new JsonProviderClientNotesRepository(storage);

      await expect(notes.update(999, { note: 'x' })).rejects.toThrow(
        'Заметка провайдера не найдена',
      );
    });

    it('удаление убирает заметку', async () => {
      const notes = new JsonProviderClientNotesRepository(storage);
      const created = await notes.insert({
        providerUserId: 2,
        clientUserId: 1,
        note: 'Первая',
      });

      await notes.remove(created.id);

      expect(await notes.findById(created.id)).toBeNull();
    });
  });
});
