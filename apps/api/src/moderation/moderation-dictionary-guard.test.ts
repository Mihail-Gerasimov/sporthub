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

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { MODERATION_ACTIONS } from '@sporthub/domain';

const CONTROLLER = path.join(__dirname, 'moderation.controller.ts');

/** Текст без комментариев: сторож смотрит на код. */
function codeOnly(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('контроллер модерации читает словарь действий, а не ветвится по ним', () => {
  // Шаг 38.38 завёл сторож с `it.fails` («ожидается зелёный на 38.39»),
  // шаг 38.39 переписал контроллер и снял пометку.
  it('в контроллере нет литералов действий и сравнений с ними', async () => {
    const code = codeOnly(await readFile(CONTROLLER, 'utf8'));
    const offenders: string[] = [];

    for (const action of MODERATION_ACTIONS) {
      if (new RegExp(`['"\`]${action}['"\`]`).test(code)) {
        offenders.push(`литерал действия «${action}»`);
      }
    }

    if (/\baction\s*[!=]==?\s*/.test(code)) offenders.push('сравнение `action ===`');
    if (!code.includes('MODERATION_ACTION_SPECS')) offenders.push('словарь не читается');

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
  });
});
