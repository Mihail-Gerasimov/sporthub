// Phase 24 Step 24.5: тесты notify() — awaitable доставка через createNotification.
// В отличие от fire-and-forget в первой редакции, теперь вызывающий код получает
// Promise<void> и может await'ить для гарантии записи (тесты, транзакционные вызовы)
// либо .catch(() => {}) для не-блокирующего сценария.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getNotifications } from '@/lib/db';
import { notify } from '@/lib/notify';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedTestData } from '@/test/helpers/seed-fixtures';

describe('notify()', () => {
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

  it('создаёт запись в notifications.json для указанного userId и type', async () => {
    await notify(1, 'booking_confirmed', { bookingId: 42 });

    const notifications = await getNotifications({ userId: 1 });

    expect(notifications.length).toBeGreaterThan(0);
    const latest = notifications[0];
    expect(latest.userId).toBe(1);
    expect(latest.type).toBe('booking_confirmed');
    expect(latest.payload).toEqual({ bookingId: 42 });
  });

  it('возвращает Promise<void>, разрешающийся после записи', async () => {
    const result = notify(2, 'link_approved', { linkId: 7 });
    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toBeUndefined();
  });

  it('silent catch: ошибка записи поглощается, Promise разрешается без throw', async () => {
    // Невалидная директория заставит createNotification упасть при writeCollection.
    const broken = '/tmp/nonexistent-sporthub-notify-test';
    process.env.SPORT_HUB_DATA_DIRECTORY = broken;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(notify(1, 'booking_confirmed', {})).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();

    // Возвращаем корректную директорию для cleanup в afterEach.
    process.env.SPORT_HUB_DATA_DIRECTORY = dataDirectory;
  });
});
