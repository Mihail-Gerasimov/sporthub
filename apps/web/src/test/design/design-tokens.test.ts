/**
 * Контракт дизайн-токенов — проверяет, что globals.css содержит
 * все обязательные CSS-переменные и @theme маппинг.
 */
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

// Путь считается от самого теста. Определять его через «корень проекта» больше
// нечем и незачем: каталога данных, по которому корень раньше искали, у фронта нет.
const globalsCss = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../app/globals.css'),
  'utf-8',
);

describe('Дизайн-токены (globals.css)', () => {
  // --- Шапка файла (шаг 38.6) ---
  // ⚠️ Шапка `globals.css` с фазы 28 обещала «тёмную дизайн-систему», а палитра
  // светлая с фазы 31: три фазы файл открывался описанием того, чего в нём нет.
  // Шапка — первое, что читает человек, и врать она не вправе.
  it('шапка файла не называет палитру тёмной и называет светлой', () => {
    const header = globalsCss.match(/^\/\*[\s\S]*?\*\//);
    expect(header).not.toBeNull();
    expect(header![0]).not.toMatch(/тёмн/i);
    expect(header![0]).toMatch(/светл/i);
  });

  // --- Палитра ---
  const paletteVars = [
    '--ui-canvas',
    '--ui-panel',
    '--ui-panel-strong',
    '--ui-ink',
    '--ui-muted',
    '--ui-line',
    '--ui-accent',
    '--ui-accent-strong',
    '--ui-accent-soft',
    '--ui-teal',
    '--ui-success',
    '--ui-warning',
    '--ui-danger',
  ];

  it.each(paletteVars)('содержит переменную палитры %s', (varName) => {
    expect(globalsCss).toContain(varName);
  });

  // --- Радиусы ---
  it('содержит токен радиуса карточки', () => {
    expect(globalsCss).toMatch(/--ui-radius-card:\s*.+;/);
  });

  it('радиус карточки не превышает 20px (минимализм)', () => {
    const match = globalsCss.match(/--ui-radius-card:\s*(\d+)px/);
    expect(match).not.toBeNull();
    const value = parseInt(match![1], 10);
    expect(value).toBeLessThanOrEqual(20);
  });

  // --- Тени ---
  it('содержит токен тени карточки', () => {
    expect(globalsCss).toMatch(/--ui-shadow-card:\s*.+;/);
  });

  it('тень карточки использует мягкие значения (blur ≤ 24px)', () => {
    // Формат: X Y blur spread rgba(...)
    const match = globalsCss.match(/--ui-shadow-card:\s*\d+\s+(\d+)px\s+(\d+)px/);
    expect(match).not.toBeNull();
    const blur = parseInt(match![2], 10);
    expect(blur).toBeLessThanOrEqual(24);
  });

  // --- Типографика ---
  it('содержит токен шрифтов display и body', () => {
    expect(globalsCss).toContain('--ui-font-display');
    expect(globalsCss).toContain('--ui-font-body');
  });

  // Шаг 38.16: два шрифта вместо трёх. Display — Sofia Sans Extra Condensed, body — Inter,
  // оба приходят переменными next/font (`--font-sofia`, `--font-inter`); собственного
  // моно-шрифта нет — `.font-mono` живёт на системном стеке, названном в `@theme inline`.
  it('display-стек собран из переменной Sofia, body — из Inter; свой моно-токен снят', () => {
    expect(globalsCss).toMatch(/--ui-font-display:\s*[^;]*var\(--font-sofia\)/);
    expect(globalsCss).toMatch(/--ui-font-body:\s*var\(--font-inter\)/);
    // Имя склеено, чтобы сторож removed-fonts не принял проверку за ссылку.
    expect(globalsCss).not.toContain(`--ui-font-${'mono'}`);
  });

  it('.font-mono — утилита на системном моно-стеке, названном в @theme inline', () => {
    const match = globalsCss.match(/--font-mono:\s*([^;]+);/);
    expect(match).not.toBeNull();
    expect(match![1]).toMatch(/ui-monospace|Menlo|monospace/);
    // Имена склеены, чтобы сторож removed-fonts не принял проверку за ссылку.
    expect(match![1]).not.toMatch(new RegExp(`var\\(--ui-font-${'mono'}\\)|Jet${'Brains'}`));
  });

  // Шаг 38.19: шкала заголовков — токенами CSS, а не TS-константой. Sofia при кегле
  // ×1,069 и весе на ступень выше совпадает с Barlow макета (−1% по ширине); коэффициент
  // и веса объявлены один раз и читаются классами `.t-*`. TS-константу в CSS не прокинуть
  // иначе как инлайновым стилем — поэтому её нет.
  it('шкала заголовков: коэффициент кегля и веса display — токены :root', () => {
    expect(globalsCss).toMatch(/--ui-scale-display:\s*1\.069;/);
    expect(globalsCss).toMatch(/--ui-weight-heading:\s*\d{3,4};/);
    expect(globalsCss).toMatch(/--ui-weight-hero:\s*\d{3,4};/);
  });

  it.each(['t-display', 't-h1', 't-h2', 't-h3'])(
    '.%s читает коэффициент и вес из токенов',
    (cls) => {
      const block = globalsCss.match(new RegExp(`\\.${cls}\\s*\\{[^}]*\\}`))?.[0] ?? '';
      expect(block).toContain('var(--ui-scale-display)');
      expect(block).toMatch(/font-weight:\s*var\(--ui-weight-(heading|hero)\)/);
    },
  );

  it('TS-констант шкалы нет: коэффициент живёт только в globals.css', async () => {
    const { readdirSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (full.includes(`${'src'}/test`)) continue;
        if (statSync(full).isDirectory()) walk(full);
        else if (
          /\.tsx?$/.test(name) &&
          /1\.069|DISPLAY_SCALE|displayScale/.test(readFileSync(full, 'utf-8'))
        ) {
          offenders.push(full);
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });

  // 38.14a: h1 без `.t-*` уходил в Inter — базовое правило слоя base отдаёт всем h1–h3
  // display-шрифт и вес заголовка.
  it('h1–h3 получают display-шрифт и вес заголовка базовым правилом', () => {
    const block = globalsCss.match(/@layer base \{[\s\S]*?h1,\s*h2,\s*h3 \{([^}]*)\}/)?.[1] ?? '';
    expect(block).toContain('font-family: var(--ui-font-display)');
    expect(block).toContain('font-weight: var(--ui-weight-heading)');
  });

  // --- @theme маппинг ---
  it('содержит @theme inline блок с цветовыми маппингами', () => {
    expect(globalsCss).toContain('@theme inline');
    expect(globalsCss).toContain('--color-canvas');
    expect(globalsCss).toContain('--color-ink');
    expect(globalsCss).toContain('--color-accent');
  });

  // --- Body ---
  // Phase 28: тёмная палитра SportHub использует ровно 2 радиальных градиента
  // (lime 5% top-left + orange 4% bottom-right) для атмосферы — это часть UI Kit.
  // Раньше (светлая палитра) допускался максимум 1 radial-gradient.
  it('body содержит не более 2 radial-gradient (атмосфера UI Kit)', () => {
    const bodyMatch = globalsCss.match(/body\s*\{[\s\S]*?\}/);
    expect(bodyMatch).not.toBeNull();
    const bodyBlock = bodyMatch![0];
    const radialCount = (bodyBlock.match(/radial-gradient/g) || []).length;
    expect(radialCount).toBeLessThanOrEqual(2);
  });
});
