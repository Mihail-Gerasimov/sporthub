// Сторож: контроллер модерации не ветвится по действию (фаза 38, шаг 38.38).
//
// Всё, чем действия модерации отличаются друг от друга, живёт в словаре
// `MODERATION_ACTION_SPECS` (`@sporthub/domain`). Контроллер читает строку словаря
// и делает одно и то же для любого действия: проверяет причину, если она нужна,
// проверяет условие, если оно названо, пишет патч, журнал, надзорную строку
// и письмо владельцу. Развилка вида `if (action === 'hide')` в контроллере —
// это действие, которое словарь не описывает, то есть пятое действие снова
// потребует правки в восьми местах вместо одного.
//
// ⚠️ Диверсия д-48: `verify` прямо в контроллер, минуя словарь. Ловится
// по трём признакам: литералу действия, сравнению `action ===` и отсутствию
// чтения словаря. Комментарии снимаются до разбора — объяснить, почему
// действия нет в коде, обязано быть можно.
//
// ⚠️ Шаг 38.54: читателей у словаря два — контроллер и раздел модерации во фронте.
// Тот держал `if (action === 'unhide')` перед `confirm(…)` — ту же развилку, только
// по другую сторону сети; словарь получил седьмое поле `confirmation`, и сторож
// смотрит на оба файла одной проверкой. Сторож — здесь, а не во фронте: словарь
// живёт в домене, и правило «читатель не ветвится» — правило словаря, не читателя.

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { MODERATION_ACTIONS } from '@sporthub/domain';

import { REPO_ROOT } from '../test/repo-root';

/**
 * Читатели словаря. `literals` — считать ли литерал действия развилкой: в контроллере
 * литерал — это действие мимо словаря (д-48); во фронте литерал — кнопка или
 * умолчание пропса (`reasonTarget?.action ?? 'hide'`), а не развилка — там
 * ловится только сравнение `action ===`.
 */
const READERS = [
  {
    name: 'контроллер модерации',
    file: path.join(__dirname, 'moderation.controller.ts'),
    literals: true,
  },
  {
    name: 'раздел модерации во фронте',
    file: path.join(REPO_ROOT, 'apps/web/src/components/admin/ModerationPage.tsx'),
    literals: false,
  },
] as const;

type Reader = (typeof READERS)[number];

/** Текст без комментариев: сторож смотрит на код. */
function codeOnly(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/** Развилки по действию в тексте читателя — пусто, если читатель честен. */
function branchingIn(code: string, literals = true): string[] {
  const offenders: string[] = [];

  for (const action of MODERATION_ACTIONS) {
    if (literals && new RegExp(`['"\`]${action}['"\`]`).test(code)) {
      offenders.push(`литерал действия «${action}»`);
    }
  }

  if (/\baction\s*[!=]==?\s*/.test(code)) offenders.push('сравнение `action ===`');
  if (!code.includes('MODERATION_ACTION_SPECS')) offenders.push('словарь не читается');

  return offenders;
}

/** Развилки в файле читателя. */
async function offendersOf(reader: Reader): Promise<string[]> {
  return branchingIn(codeOnly(await readFile(reader.file, 'utf8')), reader.literals);
}

describe('читатели словаря действий модерации не ветвятся по ним', () => {
  // Шаг 38.38 завёл сторож с `it.fails` («ожидается зелёный на 38.39»),
  // шаг 38.39 переписал контроллер и снял пометку.
  it('в контроллере нет литералов действий и сравнений с ними', async () => {
    const offenders = await offendersOf(READERS[0]);

    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  // ⚠️ `it.fails` — тем же порядком, что 38.38: поле `confirmation` заведено словарём
  // (38.54), фронт читает его своим шагом и снимает пометку. Пометка стоит ровно до
  // тех пор, пока в разделе есть `action === 'unhide'`; сняли развилку — сторож сам
  // потребует снять и пометку.
  it.fails('в разделе модерации во фронте нет сравнений с действием', async () => {
    const offenders = await offendersOf(READERS[1]);

    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('сторож видит развилку на подставном тексте', () => {
    // Обратная половина: регулярки не пустые и ловят то, ради чего написаны.
    const sample = codeOnly(`
      // if (action === 'hide') — в комментарии не считается
      const x = action === 'hide' ? 1 : 2;
    `);

    expect(/\baction\s*[!=]==?\s*/.test(sample)).toBe(true);
    expect(/['"\`]hide['"\`]/.test(sample)).toBe(true);
    expect(/['"\`]hide['"\`]/.test(codeOnly(`// 'hide' только в комментарии`))).toBe(false);
    // Та же проверка одной функцией — и на честном читателе она пуста.
    expect(branchingIn(sample)).toEqual([
      'литерал действия «hide»',
      'сравнение `action ===`',
      'словарь не читается',
    ]);
    expect(branchingIn('const spec = MODERATION_ACTION_SPECS[action];')).toEqual([]);
    // Без литералов: кнопка с именем действия — не развилка, сравнение — развилка.
    expect(branchingIn("onAction('unhide'); MODERATION_ACTION_SPECS[action]", false)).toEqual([]);
    expect(branchingIn("if (action === 'unhide') MODERATION_ACTION_SPECS[action]", false)).toEqual([
      'сравнение `action ===`',
    ]);
  });

  it('сторож читает настоящие файлы читателей, а не пустоту', async () => {
    for (const reader of READERS) {
      const code = codeOnly(await readFile(reader.file, 'utf8'));

      expect(code.includes('MODERATION_ACTION_SPECS'), `${reader.name}: словарь не читается`).toBe(
        true,
      );
    }
  });
});
