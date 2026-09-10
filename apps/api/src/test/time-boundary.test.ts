// Сторож времени.
//
// Момент занятия собирается из двух строк — дня и времени, — и запись
// `new Date(\`${date}T${time}:00\`)` даёт его в поясе ТОГО процесса, где выполняется код.
// Пояс проекта — самарский, пояс сервера обычно UTC: разница четыре часа, больше,
// чем окно автоотмены заявки (час) и окно бесплатной отмены по строгой политике (два часа).
// То есть условие переворачивалось целиком.
//
// Обычные тесты этого не ловили: тест строил «сейчас» той же неверной формулой,
// что и код, и оба сдвигались одинаково. Поэтому запрет вынесен в отдельную проверку
// по исходникам.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { API_ROOT as ROOT_OF_API } from './repo-root';

// Корень пакета выводится из корня репозитория, а не из места запуска.
const API_ROOT = ROOT_OF_API;

/**
 * Сборка момента из шаблонной строки с датой и временем — БЕЗ явного пояса.
 *
 * Явный пояс (`...Z`) ошибкой не является: так работает граница хранилища, где день
 * занятия переводится в значение колонки типа даты. Ошибка — именно молчаливый пояс:
 * его подставит процесс, и результат уедет вместе с сервером.
 */
const NAIVE_DATE_TIME = /new Date\(`[^`]*\$\{[^`]*\}T[^`]*`\)/;

/** Тот же вызов, но с явно указанным поясом. */
const EXPLICIT_ZONE = /new Date\(`[^`]*\$\{[^`]*\}T[^`]*(?:Z|[+-]\d{2}:\d{2})`\)/;

async function collectSources(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const found: string[] = [];

  for (const entry of entries) {
    const full = path.join(directory, entry.name);

    // Сгенерированный клиент базы — не наш исходник.
    if (entry.isDirectory()) {
      if (entry.name === 'prisma-client') continue;

      found.push(...(await collectSources(full)));

      continue;
    }

    if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      found.push(path.relative(API_ROOT, full));
    }
  }

  return found;
}

describe('Граница работы со временем', () => {
  it('момент занятия нигде не собирается в поясе процесса', async () => {
    const files = await collectSources(path.join(API_ROOT, 'src'));
    const offenders: string[] = [];

    for (const file of files) {
      const text = await readFile(path.join(API_ROOT, file), 'utf8');

      // Строку разбираем целиком: в файле может быть и допустимый вызов, и нет.
      for (const line of text.split('\n')) {
        if (NAIVE_DATE_TIME.test(line) && !EXPLICIT_ZONE.test(line)) {
          offenders.push(file.split(path.sep).join('/'));

          break;
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
