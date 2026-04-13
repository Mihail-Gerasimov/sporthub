/**
 * Интеграционные тесты логирования в API routes.
 * Phase 20 — Step 20.2: каждый mutation API route пишет лог при успешном действии.
 */
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { POST as POSTClub } from '@/app/api/clubs/route';
import { DELETE as DELETEClub, PATCH as PATCHClub } from '@/app/api/clubs/[id]/route';
import { POST as POSTTrainer } from '@/app/api/trainers/route';
import { DELETE as DELETETrainer, PATCH as PATCHTrainer } from '@/app/api/trainers/[id]/route';
import { POST as POSTBooking } from '@/app/api/bookings/route';
import { DELETE as DELETEBooking } from '@/app/api/bookings/[id]/route';
import { getLogs } from '@/lib/db';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedTestData } from '@/test/helpers/seed-fixtures';

// Минимальный валидный payload для создания клуба
const clubPayload = {
  name: 'Log Test Club',
  city: 'Самара',
  address: 'ул. Тестовая, 1',
  description:
    'Тестовый клуб для проверки логирования действий. Клуб оснащён современным оборудованием и предлагает разнообразные программы.',
  phone: '+7 (846) 999-00-01',
  email: 'log@test.ru',
  priceFrom: '500',
  disciplines: ['Йога'],
  tags: ['Тест'],
  amenities: ['Парковка'],
  scheduleSlots: [
    {
      title: 'Утренняя',
      date: '2026-05-01',
      startTime: '08:00',
      endTime: '09:00',
      price: '500',
      capacity: '10',
      location: 'Зал 1',
      discipline: 'Йога',
    },
  ],
  userId: 2,
};

// Минимальный валидный payload для создания тренера (схема publishTrainerSchema)
const trainerPayload = {
  firstName: 'Log',
  lastName: 'Trainer',
  city: 'Самара',
  address: 'ул. Тестовая, 2',
  bio: 'Тестовый тренер для проверки логирования действий. Опытный специалист по индивидуальным и групповым тренировкам.',
  experience: '5',
  sport: 'Йога',
  specializations: ['Хатха-йога'],
  workFormat: 'personal',
  offeringName: 'Персональная йога',
  offeringDescription: 'Индивидуальное занятие йогой',
  offeringFormat: 'personal',
  offeringPrice: '800',
  offeringDuration: '60',
  offeringLocation: 'Зал 2',
  clubId: null,
  scheduleSlots: [
    {
      title: 'Персональная',
      date: '2026-05-01',
      startTime: '10:00',
      endTime: '11:00',
      price: '800',
      capacity: '1',
      location: 'Зал 2',
      discipline: 'Йога',
    },
  ],
  userId: 2,
};

describe('логирование в API routes — clubs', () => {
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

  it('POST /api/clubs → лог publish_create с entityType club', async () => {
    const request = new NextRequest('http://localhost/api/clubs', {
      method: 'POST',
      body: JSON.stringify(clubPayload),
    });

    const response = await POSTClub(request);
    expect(response.status).toBe(201);

    // Даём fire-and-forget время завершиться
    await new Promise((resolve) => setTimeout(resolve, 50));

    const logs = await getLogs();
    const createLog = logs.find((l) => l.action === 'publish_create' && l.entityType === 'club');

    expect(createLog).toBeDefined();
    expect(createLog!.actorId).toBe(2);
    expect(createLog!.meta).toMatchObject({ name: 'Log Test Club' });
  });

  it('PATCH /api/clubs/[id] → лог publish_update', async () => {
    // Сначала создаём клуб
    const createRequest = new NextRequest('http://localhost/api/clubs', {
      method: 'POST',
      body: JSON.stringify(clubPayload),
    });
    const createResponse = await POSTClub(createRequest);
    const { data: createData } = await createResponse.json();
    const clubId = createData.club.id;

    // Обновляем клуб
    const patchRequest = new NextRequest(`http://localhost/api/clubs/${clubId}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...clubPayload, name: 'Updated Club' }),
    });
    const patchResponse = await PATCHClub(patchRequest, {
      params: Promise.resolve({ id: String(clubId) }),
    });
    expect(patchResponse.status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 50));

    const logs = await getLogs();
    const updateLog = logs.find((l) => l.action === 'publish_update' && l.entityType === 'club');

    expect(updateLog).toBeDefined();
    expect(updateLog!.entityId).toBe(clubId);
  });

  it('DELETE /api/clubs/[id] → лог publish_delete с name в meta', async () => {
    // Создаём клуб
    const createRequest = new NextRequest('http://localhost/api/clubs', {
      method: 'POST',
      body: JSON.stringify(clubPayload),
    });
    const createResponse = await POSTClub(createRequest);
    const { data: createData } = await createResponse.json();
    const clubId = createData.club.id;

    // Удаляем клуб
    const deleteRequest = new NextRequest(`http://localhost/api/clubs/${clubId}`, {
      method: 'DELETE',
    });
    const deleteResponse = await DELETEClub(deleteRequest, {
      params: Promise.resolve({ id: String(clubId) }),
    });
    expect(deleteResponse.status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 50));

    const logs = await getLogs();
    const deleteLog = logs.find((l) => l.action === 'publish_delete' && l.entityType === 'club');

    expect(deleteLog).toBeDefined();
    expect(deleteLog!.meta).toMatchObject({ name: 'Log Test Club' });
  });
});

describe('логирование в API routes — trainers', () => {
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

  it('POST /api/trainers → лог publish_create с entityType trainer', async () => {
    const request = new NextRequest('http://localhost/api/trainers', {
      method: 'POST',
      body: JSON.stringify(trainerPayload),
    });

    const response = await POSTTrainer(request);
    expect(response.status).toBe(201);

    await new Promise((resolve) => setTimeout(resolve, 50));

    const logs = await getLogs();
    const createLog = logs.find((l) => l.action === 'publish_create' && l.entityType === 'trainer');

    expect(createLog).toBeDefined();
    expect(createLog!.actorId).toBe(2);
    expect(createLog!.meta).toHaveProperty('name');
  });

  it('PATCH /api/trainers/[id] → лог publish_update', async () => {
    // Создаём тренера
    const createRequest = new NextRequest('http://localhost/api/trainers', {
      method: 'POST',
      body: JSON.stringify(trainerPayload),
    });
    const createResponse = await POSTTrainer(createRequest);
    const { data: createData } = await createResponse.json();
    const trainerId = createData.trainer.id;

    // Обновляем
    const patchRequest = new NextRequest(`http://localhost/api/trainers/${trainerId}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...trainerPayload, name: 'Updated Trainer' }),
    });
    const patchResponse = await PATCHTrainer(patchRequest, {
      params: Promise.resolve({ id: String(trainerId) }),
    });
    expect(patchResponse.status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 50));

    const logs = await getLogs();
    const updateLog = logs.find((l) => l.action === 'publish_update' && l.entityType === 'trainer');

    expect(updateLog).toBeDefined();
    expect(updateLog!.entityId).toBe(trainerId);
  });

  it('DELETE /api/trainers/[id] → лог publish_delete с name в meta', async () => {
    // Создаём тренера
    const createRequest = new NextRequest('http://localhost/api/trainers', {
      method: 'POST',
      body: JSON.stringify(trainerPayload),
    });
    const createResponse = await POSTTrainer(createRequest);
    const { data: createData } = await createResponse.json();
    const trainerId = createData.trainer.id;

    // Удаляем
    const deleteRequest = new NextRequest(`http://localhost/api/trainers/${trainerId}`, {
      method: 'DELETE',
    });
    const deleteResponse = await DELETETrainer(deleteRequest, {
      params: Promise.resolve({ id: String(trainerId) }),
    });
    expect(deleteResponse.status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 50));

    const logs = await getLogs();
    const deleteLog = logs.find((l) => l.action === 'publish_delete' && l.entityType === 'trainer');

    expect(deleteLog).toBeDefined();
    expect(deleteLog!.meta).toHaveProperty('name');
  });
});

describe('логирование в API routes — bookings', () => {
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

  it('POST /api/bookings → лог booking_create', async () => {
    const request = new NextRequest('http://localhost/api/bookings', {
      method: 'POST',
      body: JSON.stringify({ scheduleId: 1, userId: 1 }),
    });

    const response = await POSTBooking(request);
    expect(response.status).toBe(201);

    await new Promise((resolve) => setTimeout(resolve, 50));

    const logs = await getLogs();
    const createLog = logs.find((l) => l.action === 'booking_create');

    expect(createLog).toBeDefined();
    expect(createLog!.actorId).toBe(1);
    expect(createLog!.actorRole).toBe('athlete');
    expect(createLog!.entityType).toBe('booking');
  });

  it('DELETE /api/bookings/[id] → лог booking_cancel', async () => {
    // Создаём букинг
    const createRequest = new NextRequest('http://localhost/api/bookings', {
      method: 'POST',
      body: JSON.stringify({ scheduleId: 1, userId: 1 }),
    });
    const createResponse = await POSTBooking(createRequest);
    const { data: booking } = await createResponse.json();

    // Отменяем
    const deleteRequest = new NextRequest(`http://localhost/api/bookings/${booking.id}`, {
      method: 'DELETE',
      body: JSON.stringify({ userId: 1 }),
    });
    const deleteResponse = await DELETEBooking(deleteRequest, {
      params: Promise.resolve({ id: String(booking.id) }),
    });
    expect(deleteResponse.status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 50));

    const logs = await getLogs();
    const cancelLog = logs.find((l) => l.action === 'booking_cancel');

    expect(cancelLog).toBeDefined();
    expect(cancelLog!.actorId).toBe(1);
    expect(cancelLog!.entityType).toBe('booking');
    expect(cancelLog!.entityId).toBe(booking.id);
  });
});
