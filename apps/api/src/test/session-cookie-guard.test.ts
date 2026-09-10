// Сторожа cookie сессии: одно объявление имён и связь формы идентификатора.
//
// Здесь два разных сторожа, и оба обходят множество, а не отдельный случай.
//
// 1. **Имя объявлено один раз.** Имён cookie было ТРИ копии — прокси фронта,
//    модуль cookie бэкенда и набор проверок. Разъехаться они могли молча:
//    в разработке cookie называется `sh-session`, в бою — с префиксом `__Host-`,
//    и фронт с устаревшей копией разворачивал бы в бою всех вошедших, оставаясь
//    зелёным в прогоне. Комментарий в прокси утверждал, что расхождение «поймает
//    прогоном»; поймать его было нечем — сторожа не существовало.
//
// 2. **Форма идентификатора связана с его выдачей.** Прокси отбивает строку,
//    не похожую на наш идентификатор, по шаблону из `@sporthub/domain`.
//    Шаблон и генератор живут в разных пакетах, и разойтись им ничего не мешает:
//    смена `TOKEN_BYTES` в генераторе не задевает шаблон ни одной строкой.
//    Разъехавшись, они дали бы самый дорогой отказ из возможных — прокси начал бы
//    отбрасывать НОВЫЕ сессии, все и сразу, в момент выкатки.
//
// ⚠️ Наборы проверок не сканируются: они вправе называть cookie по имени —
// фикстуры кладут в неё `session-<номер>`, и это не копия объявления, а данные.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import {
  SESSION_COOKIE_NAMES,
  SESSION_TOKEN_BYTES,
  isSessionTokenShaped,
} from '@sporthub/domain/session-cookie';
import { describe, expect, it } from 'vitest';

import { createSecretToken } from '../common/secret-token';
import { REPO_ROOT } from './repo-root';

const ROOT = REPO_ROOT;

/** Единственный файл, которому позволено объявлять имя cookie. */
const DECLARATION = 'packages/domain/src/session-cookie.ts';

/** Общая часть обоих имён: и `sh-session`, и `__Host-sh-session` содержат её. */
const COOKIE_NAME_MARK = /sh-session/;

/** Каталоги вне осмотра: сгенерированное, собранное и сами наборы проверок. */
const SKIPPED_DIRECTORIES = new Set(['prisma-client', 'node_modules', 'dist', '.next', 'test']);

/** Исходники под корнем: только рабочий код, без сгенерированного и тестов. */
async function collectSources(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const found: string[] = [];

  for (const entry of entries) {
    const full = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;

      found.push(...(await collectSources(full)));

      continue;
    }

    if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx')) continue;

    if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      found.push(path.relative(ROOT, full).split(path.sep).join('/'));
    }
  }

  return found;
}

/** Корни сканирования: оба приложения и все общие пакеты. */
async function collectRoots(): Promise<string[]> {
  const packages = await readdir(path.join(ROOT, 'packages'), { withFileTypes: true });
  const roots = [path.join(ROOT, 'apps', 'api', 'src'), path.join(ROOT, 'apps', 'web', 'src')];

  for (const entry of packages) {
    if (!entry.isDirectory()) continue;

    roots.push(path.join(ROOT, 'packages', entry.name, 'src'));
  }

  return roots;
}

describe('Имя cookie сессии объявлено один раз', () => {
  it('ни один исходник, кроме доменного объявления, не пишет имя cookie', async () => {
    const roots = await collectRoots();
    const offenders: string[] = [];

    for (const root of roots) {
      let files: string[];

      try {
        files = await collectSources(root);
      } catch {
        // Пакет без каталога исходников — не нарушение, просто нечего смотреть.
        continue;
      }

      for (const file of files) {
        if (file === DECLARATION) continue;

        const text = await readFile(path.join(ROOT, file), 'utf8');

        if (COOKIE_NAME_MARK.test(text)) offenders.push(file);
      }
    }

    expect(offenders, `имя cookie объявлено копией в:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('само объявление на месте и знает оба имени', async () => {
    // Обратная сторона сторожа: «убрать копии» не должно однажды превратиться
    // в «убрать заодно и оригинал» — тогда список стал бы пустым, а сторож зелёным.
    const text = await readFile(path.join(ROOT, DECLARATION), 'utf8');

    expect(COOKIE_NAME_MARK.test(text)).toBe(true);
    expect(SESSION_COOKIE_NAMES).toHaveLength(2);
    expect(SESSION_COOKIE_NAMES.some((name) => name.startsWith('__Host-'))).toBe(true);
  });
});

describe('Отдельная точка экспорта не тянет zod', () => {
  it('пакет объявляет вход @sporthub/domain/session-cookie', async () => {
    const manifest = JSON.parse(
      await readFile(path.join(ROOT, 'packages', 'domain', 'package.json'), 'utf8'),
    ) as { exports?: Record<string, unknown> };

    expect(manifest.exports?.['./session-cookie']).toBeDefined();
  });

  it('в графе входа нет ни одного стороннего пакета', async () => {
    // ⚠️ Смысл отдельного входа ровно в этом. Общий вход пакета реэкспортирует
    // схемы публикации, а те тянут `zod`; импорт общего входа из прокси утащил бы
    // `zod` в бандл, который выполняется на КАЖДОМ обращении к закрытым разделам.
    // Граф обходится целиком, а не проверяется один файл: достаточно однажды
    // добавить сюда импорт соседнего доменного модуля — и `zod` вернётся молча.
    const visited = new Set<string>();
    const foreign: string[] = [];
    const queue = [path.join(ROOT, 'packages', 'domain', 'src', 'session-cookie.ts')];

    while (queue.length > 0) {
      const file = queue.pop() as string;

      if (visited.has(file)) continue;

      visited.add(file);

      const text = await readFile(file, 'utf8');
      // Разбираются и `import ... from '...'`, и `export ... from '...'`:
      // реэкспорт тянет чужой граф ровно так же, как импорт.
      const specifiers = [...text.matchAll(/(?:import|export)[^'"]*?from\s+'([^']+)'/g)].map(
        (match) => match[1],
      );

      for (const specifier of specifiers) {
        if (!specifier.startsWith('.')) {
          foreign.push(`${path.relative(ROOT, file)} → ${specifier}`);

          continue;
        }

        queue.push(path.resolve(path.dirname(file), `${specifier}.ts`));
      }
    }

    expect(foreign, `вход тянет чужие пакеты:\n${foreign.join('\n')}`).toEqual([]);
  });
});

describe('Форма идентификатора связана с его выдачей', () => {
  it('настоящий выданный идентификатор подходит под шаблон домена', async () => {
    // Не один — сотня: `base64url` кодирует случайные байты, и редкий символ
    // на границе алфавита проявится не на первом же значении.
    const rejected = Array.from({ length: 100 }, () => createSecretToken()).filter(
      (token) => !isSessionTokenShaped(token),
    );

    expect(rejected, `шаблон отбил выданные идентификаторы: ${rejected.join(', ')}`).toEqual([]);
  });

  it('число байт в домене совпадает с длиной выданного идентификатора', async () => {
    // Разъехавшись, эти два числа не уронили бы ничего: шаблон задан диапазоном
    // и продолжал бы пропускать. Сверка нужна, чтобы диапазон считался от правды.
    expect(createSecretToken()).toHaveLength(Math.ceil((SESSION_TOKEN_BYTES * 4) / 3));
  });

  it('чужая строка той же длины шаблоном не проходит', async () => {
    const length = createSecretToken().length;
    const foreign = Array.from({ length }, (_, index) => 'привет'[index % 6]).join('');

    expect(foreign).toHaveLength(length);
    expect(isSessionTokenShaped(foreign)).toBe(false);
  });
});
