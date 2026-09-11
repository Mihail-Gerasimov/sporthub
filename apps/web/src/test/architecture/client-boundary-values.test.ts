// Сторож: серверная страница не берёт ЗНАЧЕНИЯ из модуля с `'use client'` (шаг 37.61).
//
// ⚠️ Зачем сторож и почему его не заменяет ни сборка, ни тест подключения.
//
// Раздел «Надзор» не открывался НИ У КОГО: размер страницы (`SUPERVISION_PAGE_SIZE`)
// был объявлен внутри компонента с `'use client'`, а серверная страница импортировала
// его, чтобы запросить первую страницу ленты. Через границу «сервер → клиент»
// приезжает не число, а заглушка: обращение к ней на сервере бросает
// «Attempted to call SUPERVISION_PAGE_SIZE() from the server». Заглушка молча уехала
// в `String(...)` и дальше в строку запроса — бэкенд ответил 400, страница показала
// «Сервис временно недоступен».
//
// Сборка при этом ПРОХОДИТ: границу проверяет рантайм. Тест подключения ровно про эту
// страницу был ЗЕЛЁНЫМ четыре проверки из четырёх: в jsdom границы нет, там это
// обычное число, и тест сравнивал `limit` с той же константой. Дефект нашёл браузер —
// то есть единственная проверка, где сервер и браузер разные.
//
// ⚠️ Правило намеренно НЕ запрещает импорт клиентских компонентов серверными
// страницами: это обычный и нужный приём, компонент приезжает ссылкой и на сервере
// не вычисляется. Запрещается брать оттуда именно ЗНАЧЕНИЯ — константы и функции,
// которые сервер попытается использовать.
//
// Различаются они по имени: компонент пишется с Заглавной (`AdminNotificationsPage`),
// значение — иначе (`SUPERVISION_PAGE_SIZE`, `formatDate`). Правило грубое, но его
// нарушение — всегда ошибка, а обход требует назвать константу как компонент.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WEB_ROOT } from '../web-root';

const SRC = path.join(WEB_ROOT, 'src');

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await sourceFiles(full)));
      continue;
    }

    if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
      files.push(full);
    }
  }

  return files;
}

/**
 * Объявляет ли модуль себя клиентским.
 *
 * ⚠️ Комментарии перед директивой законны и в этом проекте есть почти везде:
 * каждый файл начинается с пояснения назначения. Поэтому они снимаются до разбора —
 * иначе сторож не узнал бы ни одного клиентского модуля и остался бы зелёным.
 */
function isClientModule(text: string): boolean {
  const withoutComments = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  return /^\s*(['"])use client\1/.test(withoutComments);
}

/** Импорты вида `import { a, B } from '@/...'` — без `import type`. */
function valueImports(text: string): { from: string; names: string[] }[] {
  const found: { from: string; names: string[] }[] = [];
  const pattern = /import\s+(?!type\s)\{([^}]+)\}\s+from\s+'(@\/[^']+)'/g;

  for (const match of text.matchAll(pattern)) {
    const names = match[1]
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name.length > 0 && !name.startsWith('type '))
      .map((name) => name.split(/\s+as\s+/)[0].trim());

    found.push({ from: match[2], names });
  }

  return found;
}

/** Похоже ли имя на компонент: с Заглавной буквы и не целиком в верхнем регистре. */
function looksLikeComponent(name: string): boolean {
  return /^[A-Z]/.test(name) && name !== name.toUpperCase();
}

/** `@/lib/x` → путь к файлу. */
function resolveAlias(spec: string): string[] {
  const base = path.join(SRC, spec.slice('@/'.length));

  return [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')];
}

describe('серверные файлы не берут значения из клиентских модулей (37.61)', () => {
  it('ни одна серверная страница не импортирует значение из модуля с «use client»', async () => {
    const files = await sourceFiles(SRC);
    const clientModules = new Set<string>();

    for (const file of files) {
      if (isClientModule(await readFile(file, 'utf8'))) clientModules.add(file);
    }

    const offenders: string[] = [];

    // ⚠️ Граница проходит по `src/app/**`. Файл БЕЗ `'use client'` вне этого каталога
    // серверным не является: директива нужна на входе в клиентское поддерево, и модуль,
    // который импортируют только из клиентского кода, сам клиентский. Проверять
    // «любой файл без директивы» значило бы краснеть на законных местах.
    const serverFiles = files.filter((file) => file.startsWith(path.join(SRC, 'app')));

    for (const file of serverFiles) {
      const text = await readFile(file, 'utf8');

      // Клиентский файл вправе брать у клиентского что угодно: границы между ними нет.
      if (isClientModule(text)) continue;

      for (const { from, names } of valueImports(text)) {
        const target = resolveAlias(from).find((candidate) => clientModules.has(candidate));

        if (target === undefined) continue;

        for (const name of names) {
          if (looksLikeComponent(name)) continue;

          offenders.push(`${path.relative(WEB_ROOT, file)} берёт «${name}» из клиентского ${from}`);
        }
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('сторож обходит настоящие файлы и видит клиентские модули', async () => {
    // ⚠️ Девять текстовых сторожей этого проекта однажды считали корень от каталога
    // запуска и обходили пустоту, оставаясь зелёными.
    const files = await sourceFiles(SRC);
    let clients = 0;

    for (const file of files) {
      if (isClientModule(await readFile(file, 'utf8'))) clients += 1;
    }

    const serverFiles = files.filter((file) => file.startsWith(path.join(SRC, 'app')));

    expect(files.length).toBeGreaterThan(200);
    expect(clients).toBeGreaterThan(20);
    // Серверные страницы обязаны быть найдены: без них сторож обходил бы пустоту.
    expect(serverFiles.length).toBeGreaterThan(20);
  });

  it('сторож видит нарушение на подставном тексте', () => {
    // Без этой проверки «нарушений нет» может означать «разбор импортов не узнаёт их».
    const broken =
      "import { SUPERVISION_PAGE_SIZE } from '@/components/admin/AdminNotificationsPage';";
    const parsed = valueImports(broken);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].names).toEqual(['SUPERVISION_PAGE_SIZE']);
    expect(looksLikeComponent('SUPERVISION_PAGE_SIZE')).toBe(false);
    // А компонент из того же модуля — законный импорт.
    expect(looksLikeComponent('AdminNotificationsPage')).toBe(true);
  });
});
