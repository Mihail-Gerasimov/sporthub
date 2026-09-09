// Сторож: браузер не называет себя сам.
//
// Фаза 34 перенесла личность в серверную сессию. Обычные тесты этого не стерегут:
// вернувшееся поле `userId` в теле запроса ничего не сломает — сервер его просто
// проигнорирует, экран будет работать, а дыра вернётся вместе с первым же
// маршрутом, который снова начнёт этому полю верить.
//
// Поэтому запрет стережёт проверка по исходникам, а не по поведению. Она ловит
// четыре способа вернуть прежнее устройство:
//
//   1. cookie `sh-auth-user-id` — её писал сам браузер, и правка одного числа
//      в инструментах разработчика открывала чужой кабинет;
//   2. константы вида `MVP_ADMIN_USER_ID` — фронт знал наперёд, кто админ;
//   3. поля личности в теле и строке запроса;
//   4. запись в журнал с клиента — маршрута `POST /api/logs` больше нет вовсе.
//
// ⚠️ Номер в АДРЕСЕ маршрута (`/api/users/7/...`) под запрет не попадает и попасть
// не должен: это «чью вещь трогаем», а не «кто я». Сервер сверяет его с сессией.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const WEB_ROOT = process.cwd();

/** Поля, которыми клиент раньше объявлял свою личность. */
const IDENTITY_FIELDS = ['userId', 'adminUserId', 'providerUserId', 'moderatorId', 'actorId'];

/** Обход исходников. Тесты пропускаются: они вправе описывать и прежнее устройство. */
async function collectFiles(directory: string, skipPrefix: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const found: string[] = [];

  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    const relative = path.relative(WEB_ROOT, full);

    if (relative.startsWith(skipPrefix)) continue;

    if (entry.isDirectory()) {
      found.push(...(await collectFiles(full, skipPrefix)));
      continue;
    }

    if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      found.push(relative);
    }
  }

  return found;
}

async function readProductionSources(): Promise<{ file: string; text: string }[]> {
  const files = await collectFiles(path.join(WEB_ROOT, 'src'), 'src/test');

  return Promise.all(
    files.map(async (file) => ({ file, text: await readFile(path.join(WEB_ROOT, file), 'utf8') })),
  );
}

/**
 * Тела запросов, собранные литералом: содержимое каждого `JSON.stringify(` до
 * парной скобки. Разбор скобок, а не регулярное выражение: тело бывает
 * многострочным и с вложенными объектами, и «до первой закрывающей» обрезало бы
 * его на первом же вложении — как раз там, где обычно и пряталось лишнее поле.
 */
export function extractRequestBodies(source: string): string[] {
  const bodies: string[] = [];
  const marker = 'JSON.stringify(';
  let index = source.indexOf(marker);

  while (index !== -1) {
    let depth = 0;
    let cursor = index + marker.length - 1;

    for (; cursor < source.length; cursor += 1) {
      const character = source[cursor];

      if (character === '(') depth += 1;
      else if (character === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
    }

    bodies.push(source.slice(index + marker.length, cursor));
    index = source.indexOf(marker, cursor);
  }

  return bodies;
}

/** Есть ли в тексте тела ключ личности. Ищется именно КЛЮЧ объекта, а не слово. */
export function namesIdentityField(body: string): boolean {
  return IDENTITY_FIELDS.some((field) =>
    new RegExp(`(^|[{,\\s])${field}\\s*(:|,|$|\\})`).test(body),
  );
}

describe('Сторож личности на клиенте', () => {
  it('детектор ловит поле личности в теле запроса', () => {
    // Проверка самого сторожа: без неё он мог бы тихо превратиться в заглушку,
    // которая всегда зелёная, и запрет перестал бы что-либо значить.
    const sample = "fetch('/x', { body: JSON.stringify({ scheduleId, userId: athleteUserId }) })";
    const bodies = extractRequestBodies(sample);

    expect(bodies).toHaveLength(1);
    expect(namesIdentityField(bodies[0])).toBe(true);
    expect(namesIdentityField('{ scheduleId }')).toBe(false);
  });

  it('детектор не обрезает тело на вложенном объекте', () => {
    const sample = 'JSON.stringify({ meta: { a: 1 }, moderatorId: 3 })';

    expect(namesIdentityField(extractRequestBodies(sample)[0])).toBe(true);
  });

  it('cookie `sh-auth-user-id` не осталось в коде', async () => {
    const sources = await readProductionSources();
    const offenders = sources
      .filter(({ text }) => text.includes('sh-auth-user-id'))
      .map(({ file }) => file);

    expect(offenders).toEqual([]);
  });

  it('фронт не пишет личность в cookie браузера', async () => {
    // Запись в `document.cookie` — тот самый способ, которым личность подменялась.
    // Cookie сессии для скриптов закрыта, и ставит её только сервер.
    const sources = await readProductionSources();
    const offenders = sources
      .filter(({ text }) => /document\.cookie\s*=/.test(text))
      .map(({ file }) => file);

    expect(offenders).toEqual([]);
  });

  it('фронт не знает наперёд номеров пользователей', async () => {
    const sources = await readProductionSources();
    const offenders = sources
      .filter(({ text }) => /MVP_[A-Z_]*USER_ID/.test(text))
      .map(({ file }) => file);

    expect(offenders).toEqual([]);
  });

  it('в телах запросов нет полей личности', async () => {
    const sources = await readProductionSources();
    const offenders = sources
      .filter(({ text }) => extractRequestBodies(text).some(namesIdentityField))
      .map(({ file }) => file);

    expect(offenders).toEqual([]);
  });

  it('в строках запроса нет полей личности', async () => {
    const sources = await readProductionSources();
    const pattern = new RegExp(`[?&](${IDENTITY_FIELDS.join('|')})=`);
    const offenders = sources.filter(({ text }) => pattern.test(text)).map(({ file }) => file);

    expect(offenders).toEqual([]);
  });

  it('журнал с клиента не пишется — маршрута записи больше нет', async () => {
    // Событие называл сам браузер: и действие, и исполнителя. То есть журнал
    // говорил ровно то, что ему велел клиент. Пишет только сервер.
    const sources = await readProductionSources();
    const offenders = sources
      .filter(({ text }) => /['"`]\/api\/logs['"`]/.test(text))
      .map(({ file }) => file);

    expect(offenders).toEqual([]);
  });
});
