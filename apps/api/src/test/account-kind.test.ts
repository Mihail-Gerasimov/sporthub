/**
 * Вид учётной записи (шаги 35.18, 35.18a).
 *
 * Фаза 35 убирает роли. Из владения не выводится ровно одно различие —
 * администратор, и оно переезжает в колонку `account_kind`. Здесь проверяется
 * не словарь, а его ПОДКЛЮЧЕНИЕ: что признак доезжает от базы до кода и что
 * администратор действительно не получает базовый набор человека.
 *
 * ⚠️ Проверка «словарь полон» жила бы в пакете домена и была бы зелёной всегда.
 * Урок фазы 34: покрывать надо применение, а не объявление.
 */

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ACCOUNT_KINDS, hasHumanAbilities, isAdminKind } from '@sporthub/domain';
import { fixtureCollections } from '@sporthub/fixtures';

import { createTestHarness, type TestHarness } from './harness';

const ADMIN_ID = 3;
const ATHLETE_ID = 1;

describe('Вид учётной записи', () => {
  let harness: TestHarness;
  let adminCookie: string;
  let athleteCookie: string;

  beforeAll(async () => {
    harness = await createTestHarness('account-kind');
  });

  beforeEach(async () => {
    await harness.writeMany(fixtureCollections);
    adminCookie = await harness.as(ADMIN_ID);
    athleteCookie = await harness.as(ATHLETE_ID);
  });

  afterAll(async () => {
    await harness.close();
  });

  it('словарь состоит из человека и администратора', () => {
    expect([...ACCOUNT_KINDS]).toEqual(['person', 'admin']);
    expect(hasHumanAbilities('person')).toBe(true);
    expect(hasHumanAbilities('admin')).toBe(false);
    expect(isAdminKind('admin')).toBe(true);
  });

  it('признак доезжает от базы до кода', async () => {
    // ⚠️ Главное в наборе. Колонка может быть заполнена верно, а до приложения
    // не доехать — тогда все проверки ниже станут проверять умолчание.
    const users = await harness.read<{ id: number; accountKind?: string }[]>('users');
    const admin = users.find((row) => row.id === ADMIN_ID);
    const athlete = users.find((row) => row.id === ATHLETE_ID);

    expect(admin?.accountKind, 'у администратора не тот вид учётной записи').toBe('admin');
    expect(athlete?.accountKind, 'у обычного человека не тот вид').toBe('person');
  });

  describe('администратор не получает базовый набор (решение заказчика 13)', () => {
    it('не записывается на занятия', async () => {
      const response = await request(harness.app.getHttpServer())
        .post('/api/bookings')
        .set('Cookie', adminCookie)
        .send({ scheduleId: 1001, name: 'Администратор', phone: '+7 (900) 000-00-03' });

      expect(response.status, 'администратор записался на занятие').toBe(403);
    });

    it('не оставляет отзывы', async () => {
      const response = await request(harness.app.getHttpServer())
        .post('/api/reviews')
        .set('Cookie', adminCookie)
        .send({ clubId: 1, rating: 5, text: 'Отзыв от администратора — так быть не должно.' });

      expect(response.status, 'администратор оставил отзыв').toBe(403);
    });

    it('контрольная группа: обычный человек записывается', async () => {
      // Без неё «администратору отказано» неотличимо от «отказано всем».
      const response = await request(harness.app.getHttpServer())
        .post('/api/bookings')
        .set('Cookie', athleteCookie)
        .send({ scheduleId: 1001, name: 'Алексей Смирнов', phone: '+7 (900) 000-00-02' });

      expect(
        response.status === 201 || response.status === 200,
        `обычная запись сломалась: ${response.status}`,
      ).toBe(true);
    });
  });
});
