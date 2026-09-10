// Сторож отменённых санкций за неявки.
//
// Фаза 35, этап Э0a: механизм «три неявки подряд → неделя без записи» вырезан
// целиком — решение заказчика, санкции продумываются заново отдельной работой.
// Вырезано именно ЦЕЛИКОМ: правило, запрет записи, три типа уведомлений, группа
// настроек, маршрут ручного послабления, колонки админки, поля в базе, плашки
// и баннеры, класс ошибки со своей формой ответа и три действия журнала.
//
// Зачем сторож. Такие уборки не доводятся до конца сами: остаток живёт мёртвым
// полем в словаре, пустой вкладкой настроек или веткой фильтра ошибок, которую
// никто не вызывает. Компилятор молчит — это валидный код, — а следующая фаза
// честно переносит остаток на новые сущности, тратя работу на то, чего нет.
//
// Что НЕ вырезано и вырезано быть не должно — надёжность (`computeAthleteReliability`
// и провайдерские расчёты). Неявки по-прежнему считаются и опускают бейдж: он
// ИНФОРМИРУЕТ, а не наказывает. Сторож проверяет отсутствие санкций, а не отсутствие
// учёта неявок.
//
// Документы и файлы фаз намеренно НЕ сканируются: там механизм остаётся как
// история решения, и стирать её незачем.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { REPO_ROOT } from './repo-root';

// Корень ищется по признаку, а не отсчётом уровней от места запуска.
const ROOT = REPO_ROOT;

/** Что ищем. Оба написания — механизм назывался так и в коде, и в комментариях. */
const FORBIDDEN = [
  { pattern: /quarantine/i, why: 'упоминание отменённого механизма' },
  { pattern: /карантин/i, why: 'упоминание отменённого механизма' },
];

/**
 * Каталоги, которые не сканируются, и почему.
 *
 * `prisma-client` — сгенерированный клиент базы: он пересобирается из схемы,
 * своей правке не подлежит и отстаёт ровно до следующей генерации.
 */
const SKIPPED_DIRECTORIES = new Set(['prisma-client', 'node_modules', 'dist', '.next']);

/**
 * Файлы, которым слово разрешено, и почему именно им.
 *
 * Список закрытый и короткий по замыслу: каждая запись — сторож самого удаления,
 * то есть место, которое обязано называть удалённое по имени, чтобы доказать,
 * что его нет. Всё остальное — остаток, и он краснит этот тест.
 */
const ALLOWED = new Map([
  ['apps/api/src/test/quarantine-boundary.test.ts', 'сам сторож — он и держит образцы'],
  [
    'apps/api/src/admin/admin.controller.test.ts',
    'проверка «маршрута ручного послабления больше нет»: адрес обязан быть назван',
  ],
]);

/** Все исходники под корнем: только код, без сгенерированного и собранного. */
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

describe('Отменённые санкции за неявки', () => {
  it('в исходниках приложений и пакетов не осталось упоминаний механизма', async () => {
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
        if (ALLOWED.has(file)) continue;

        const text = await readFile(path.join(ROOT, file), 'utf8');

        for (const { pattern, why } of FORBIDDEN) {
          if (pattern.test(text)) offenders.push(`${file} — ${why}`);
        }
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('надёжность вырезанию не подлежит и осталась на месте', async () => {
    // Обратная сторона того же сторожа: «убрать упоминания» не должно однажды
    // превратиться в «убрать заодно и расчёт». Неявки считаются — просто не карают.
    const domain = await import('@sporthub/domain');

    expect(typeof domain.computeAthleteReliability).toBe('function');
    expect(typeof domain.computeClubReliability).toBe('function');
    expect(typeof domain.computeTrainerReliability).toBe('function');

    const reliability = domain.computeAthleteReliability(
      [
        { id: 1, userId: 1, status: 'no_show' },
        { id: 2, userId: 1, status: 'no_show' },
        { id: 3, userId: 1, status: 'no_show' },
      ] as never,
      1,
    );

    expect(reliability.noShowCount).toBe(3);
  });
});
