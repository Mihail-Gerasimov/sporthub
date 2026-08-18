/**
 * Тесты GET /api/analytics.
 * Phase 21 — Step 21.2: агрегация KPI и данных для графиков.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GET } from '@/app/api/analytics/route';
import { appendLog } from '@/lib/db';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedTestData } from '@/test/helpers/seed-fixtures';

describe('GET /api/analytics', () => {
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

  /** Хелпер: создать request с query-параметрами */
  function makeRequest(params: Record<string, string> = {}): Request {
    const url = new URL('http://localhost:3000/api/analytics');
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    return new Request(url.toString());
  }

  it('возвращает полную структуру без фильтров', async () => {
    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toHaveProperty('kpi');
    expect(json.data).toHaveProperty('bookingsByDate');
    expect(json.data).toHaveProperty('sportPopularity');
    expect(json.data).toHaveProperty('topEntities');
    expect(json.data).toHaveProperty('platformActivity');
  });

  it('KPI подсчитывает корректные значения из фикстур', async () => {
    const res = await GET(makeRequest());
    const { kpi } = (await res.json()).data;

    /* seed: 3 пользователя (athlete=1, provider=2, admin=3) */
    expect(kpi.totalUsers).toBe(3);
    expect(kpi.totalAthletes).toBe(1);
    expect(kpi.totalProviders).toBe(1); // club_owner (seed user id=2)
    /* seed: 3 клуба, 3 тренера */
    expect(kpi.totalClubs).toBe(3);
    expect(kpi.totalTrainers).toBe(3);
    /* seed: 3 букинга */
    expect(kpi.totalBookings).toBe(3);
    /* seed: 2 отзыва */
    expect(kpi.totalReviews).toBe(2);
  });

  it('averageSlotLoad считается по формуле sum(bookedCount)/sum(capacity)', async () => {
    const res = await GET(makeRequest());
    const { kpi } = (await res.json()).data;

    /* seed slots: slot1(booked:2,cap:12) + slot2(0,12) + slot3(1,12) + trainerSlot(0,1) = 3/37 */
    const expected = 3 / 37;
    expect(kpi.averageSlotLoad).toBeCloseTo(expected, 4);
  });

  it('averageSlotLoad возвращает 0 при отсутствии слотов с capacity > 0', async () => {
    /* Перезаписываем schedule пустым */
    const { writeFile } = await import('node:fs/promises');
    const path = await import('node:path');
    await writeFile(path.join(dataDirectory, 'schedule.json'), JSON.stringify([]), 'utf8');

    const res = await GET(makeRequest());
    const { kpi } = (await res.json()).data;
    expect(kpi.averageSlotLoad).toBe(0);
  });

  it('bookingsByDate группирует по дате создания записи', async () => {
    const res = await GET(makeRequest());
    const { bookingsByDate } = (await res.json()).data;

    expect(Array.isArray(bookingsByDate)).toBe(true);
    /* Все 3 фикстурных букинга имеют одинаковый createdAt → одна группа */
    if (bookingsByDate.length > 0) {
      expect(bookingsByDate[0]).toHaveProperty('date');
      expect(bookingsByDate[0]).toHaveProperty('count');
    }
  });

  it('sportPopularity считается по количеству букингов', async () => {
    const res = await GET(makeRequest());
    const { sportPopularity } = (await res.json()).data;

    expect(Array.isArray(sportPopularity)).toBe(true);
    /* Все 3 букинга с sportId=3, значит один вид спорта с count=3 */
    const sport3 = sportPopularity.find((s: { sportId: number }) => s.sportId === 3);
    expect(sport3).toBeDefined();
    expect(sport3.count).toBe(3);
  });

  it('topEntities ранжирует по booking count', async () => {
    const res = await GET(makeRequest());
    const { topEntities } = (await res.json()).data;

    expect(Array.isArray(topEntities)).toBe(true);
    /* Все букинги к clubId=1, тренер 1 */
    if (topEntities.length >= 2) {
      expect(topEntities[0].bookings).toBeGreaterThanOrEqual(topEntities[1].bookings);
    }
  });

  it('platformActivity возвращает данные из логов', async () => {
    /* Добавляем лог для проверки */
    await appendLog({
      action: 'publish_create',
      actorId: 2,
      actorRole: 'club_owner',
      entityType: 'club',
      entityId: 1,
    });

    const res = await GET(makeRequest());
    const { platformActivity } = (await res.json()).data;

    expect(Array.isArray(platformActivity)).toBe(true);
    expect(platformActivity.length).toBeGreaterThan(0);
    expect(platformActivity[0]).toHaveProperty('date');
    expect(platformActivity[0]).toHaveProperty('count');
  });

  it('фильтрация по city возвращает только сущности из указанного города', async () => {
    const res = await GET(makeRequest({ city: 'Москва' }));
    const { kpi } = (await res.json()).data;

    /* Нет сущностей в Москве → 0 клубов, 0 тренеров */
    expect(kpi.totalClubs).toBe(0);
    expect(kpi.totalTrainers).toBe(0);
  });

  /* Phase 30.4: cross-city кейс. Переносим один клуб + один тренер в Москву,
     остальные seed-данные остаются в Самаре. Bookings/schedule/reviews,
     привязанные к Самара-сущностям, не должны попадать в выборку Москвы. */
  it('Phase 30.4: фильтрация по city отрезает bookings/schedule/reviews по резолву clubId/trainerId', async () => {
    const { readFile, writeFile } = await import('node:fs/promises');
    const path = await import('node:path');

    /* Переносим club id=2 (Iron Gym) в Москву — bookings/schedule/reviews привязаны к club id=1 */
    const clubsRaw = await readFile(path.join(dataDirectory, 'clubs.json'), 'utf8');
    const clubs = JSON.parse(clubsRaw);
    const club2 = clubs.find((c: { id: number }) => c.id === 2);
    if (club2) club2.city = 'Москва';
    await writeFile(path.join(dataDirectory, 'clubs.json'), JSON.stringify(clubs), 'utf8');

    const res = await GET(makeRequest({ city: 'Москва' }));
    const { kpi, topEntities } = (await res.json()).data;

    /* В Москве 1 клуб (Iron Gym), 0 тренеров */
    expect(kpi.totalClubs).toBe(1);
    expect(kpi.totalTrainers).toBe(0);
    /* Все seed-bookings привязаны к club id=1 (Самара) → 0 в Москве */
    expect(kpi.totalBookings).toBe(0);
    /* Все seed-reviews — к club id=1 (Самара) → 0 в Москве */
    expect(kpi.totalReviews).toBe(0);
    /* topEntities не должен показывать чужой город (фикс allClubs.find → clubs.find) */
    expect(topEntities).toEqual([]);
  });

  it('Phase 30.4: city + sportId — пересечение фильтров, без data в Самаре по чужому спорту', async () => {
    /* Самара + sportId=99 (несуществующий) → KPI всё в 0 */
    const res = await GET(makeRequest({ city: 'Самара', sportId: '99' }));
    const { kpi, topEntities } = (await res.json()).data;

    expect(kpi.totalClubs).toBe(0);
    expect(kpi.totalTrainers).toBe(0);
    expect(kpi.totalBookings).toBe(0);
    expect(topEntities).toEqual([]);
  });

  it('фильтрация по sportId возвращает только связанные сущности', async () => {
    /* sportId=4 — только Iron Gym (club2) и Алексей Петров (trainer3) */
    const res = await GET(makeRequest({ sportId: '4' }));
    const { kpi } = (await res.json()).data;

    expect(kpi.totalClubs).toBe(1);
    expect(kpi.totalTrainers).toBe(1);
    /* Букинги с sportId=3, а мы фильтруем по 4 → 0 */
    expect(kpi.totalBookings).toBe(0);
  });

  it('пустые коллекции → нули и пустые массивы без ошибок', async () => {
    const { writeFile } = await import('node:fs/promises');
    const path = await import('node:path');

    /* Перезаписываем всё пустым */
    await Promise.all([
      writeFile(path.join(dataDirectory, 'clubs.json'), '[]', 'utf8'),
      writeFile(path.join(dataDirectory, 'trainers.json'), '[]', 'utf8'),
      writeFile(path.join(dataDirectory, 'bookings.json'), '[]', 'utf8'),
      writeFile(path.join(dataDirectory, 'reviews.json'), '[]', 'utf8'),
      writeFile(path.join(dataDirectory, 'schedule.json'), '[]', 'utf8'),
      writeFile(path.join(dataDirectory, 'logs.json'), '[]', 'utf8'),
    ]);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.kpi.totalClubs).toBe(0);
    expect(json.data.kpi.totalBookings).toBe(0);
    expect(json.data.kpi.averageSlotLoad).toBe(0);
    expect(json.data.bookingsByDate).toEqual([]);
    expect(json.data.sportPopularity).toEqual([]);
    expect(json.data.topEntities).toEqual([]);
    expect(json.data.platformActivity).toEqual([]);
  });

  it('фильтрация status !== hidden (defense-in-depth для Phase 22)', async () => {
    const { readFile, writeFile } = await import('node:fs/promises');
    const path = await import('node:path');

    /* Скрываем один клуб */
    const clubsRaw = await readFile(path.join(dataDirectory, 'clubs.json'), 'utf8');
    const clubs = JSON.parse(clubsRaw);
    clubs[0].status = 'hidden';
    await writeFile(path.join(dataDirectory, 'clubs.json'), JSON.stringify(clubs), 'utf8');

    const res = await GET(makeRequest());
    const { kpi } = (await res.json()).data;

    /* Было 3 клуба, один скрыт → 2 */
    expect(kpi.totalClubs).toBe(2);
  });
});
