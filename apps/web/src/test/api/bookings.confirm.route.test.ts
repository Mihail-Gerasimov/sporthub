// Phase 24 Step 24.4: тесты POST /api/bookings/[id]/confirm.
// Проверяют успех сценария (provider подтверждает pending), guard'ы (роль, wrong owner),
// маппинг ошибок FSM (409 при недопустимом переходе).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { POST as confirmRoute } from '@/app/api/bookings/[id]/confirm/route';
import { createBookingAtomic } from '@/lib/db';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedTestData } from '@/test/helpers/seed-fixtures';

const createConfirmRequest = (id: string, body: Record<string, unknown>) => ({
  request: new Request(`http://localhost:3000/api/bookings/${id}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }),
  params: Promise.resolve({ id }),
});

describe('POST /api/bookings/[id]/confirm', () => {
  let dataDirectory: string;

  beforeEach(async () => {
    dataDirectory = await createIsolatedDataDirectory();
    await seedTestData(dataDirectory);
    process.env.SPORT_HUB_DATA_DIRECTORY = dataDirectory;
  });

  afterEach(async () => {
    delete process.env.SPORT_HUB_DATA_DIRECTORY;
    await removeIsolatedDataDirectory(dataDirectory);
  });

  it('provider (managedByUserId=2) подтверждает pending-запись на тренера', async () => {
    // fixtureTrainer id=1 managedByUserId=2; slot 1001 привязан к trainer 1.
    const booking = await createBookingAtomic({ scheduleId: 1001, userId: 1 });

    const { request, params } = createConfirmRequest(String(booking.id), { userId: 2 });
    const response = await confirmRoute(request, { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('confirmed');
    expect(body.data.statusHistory).toHaveLength(2);
    expect(body.data.statusHistory[1]).toMatchObject({
      from: 'pending',
      to: 'confirmed',
      actor: 'provider',
      actorUserId: 2,
    });
  });

  it('возвращает 403, если userId не управляет parent-сущностью', async () => {
    const booking = await createBookingAtomic({ scheduleId: 1001, userId: 1 });

    // userId=1 — сам атлет, не владеет клубом/тренером.
    const { request, params } = createConfirmRequest(String(booking.id), { userId: 1 });
    const response = await confirmRoute(request, { params });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
  });

  it('возвращает 404 для несуществующего booking', async () => {
    const { request, params } = createConfirmRequest('99999', { userId: 2 });
    const response = await confirmRoute(request, { params });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
  });

  it('возвращает 400 при невалидном id', async () => {
    const { request, params } = createConfirmRequest('abc', { userId: 2 });
    const response = await confirmRoute(request, { params });

    expect(response.status).toBe(400);
  });

  it('возвращает 409 при попытке подтвердить не-pending booking', async () => {
    const booking = await createBookingAtomic({ scheduleId: 1001, userId: 1 });
    // Первое подтверждение ок
    const { request: ok, params: okParams } = createConfirmRequest(String(booking.id), {
      userId: 2,
    });
    await confirmRoute(ok, { params: okParams });

    // Повторное — недопустимый переход (confirmed → confirmed нет в FSM_TRANSITIONS).
    const { request, params } = createConfirmRequest(String(booking.id), { userId: 2 });
    const response = await confirmRoute(request, { params });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain('Недопустимый переход');
  });
});
