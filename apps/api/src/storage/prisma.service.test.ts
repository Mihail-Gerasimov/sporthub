// Проверка настроек соединения с базой.
//
// Настройки читаются один раз при запуске, и ошибка в них видна не сразу: процесс
// поднимается, а падает на первом запросе к базе. Поэтому неверные значения
// отбиваются здесь же, с текстом, по которому понятно, что делать.

import { describe, expect, it } from 'vitest';

import { readDatabaseSettings } from './prisma.service';

describe('Настройки соединения с базой', () => {
  it('берёт строку подключения и размер пула из окружения', () => {
    expect(
      readDatabaseSettings({
        DATABASE_URL: 'postgresql://sporthub@127.0.0.1:5434/sporthub',
        DATABASE_POOL_SIZE: '4',
      } as NodeJS.ProcessEnv),
    ).toEqual({
      connectionString: 'postgresql://sporthub@127.0.0.1:5434/sporthub',
      poolSize: 4,
    });
  });

  it('без явного размера пула берёт значение по умолчанию', () => {
    expect(
      readDatabaseSettings({
        DATABASE_URL: 'postgresql://sporthub@127.0.0.1:5434/sporthub',
      } as NodeJS.ProcessEnv).poolSize,
    ).toBe(10);
  });

  it('без строки подключения не запускается и говорит, что делать', () => {
    expect(() => readDatabaseSettings({} as NodeJS.ProcessEnv)).toThrow(/npm run db:up/);
  });

  it('отбивает бессмысленный размер пула, а не молча берёт своё', () => {
    for (const poolSize of ['0', '-1', 'много', '2.5']) {
      expect(() =>
        readDatabaseSettings({
          DATABASE_URL: 'postgresql://sporthub@127.0.0.1:5434/sporthub',
          DATABASE_POOL_SIZE: poolSize,
        } as NodeJS.ProcessEnv),
      ).toThrow(/Размер пула/);
    }
  });
});
