// Сторож: шкала заголовков — числами макета (шаг 38.109, сверка бок о бок 16.09).
//
// ⚠️ Зачем. У нас заголовки секций были визуально мельче, а H1 героя крупнее макета:
// множитель `--ui-scale-display` 1,069 (компенсация узкого Sofia, 38.19) давал H1 77px
// против 72 макета, а `.t-h2` стоял фиксированными 36px против текучих `3vw` = 43,2px
// на 1440. Решение заказчика — числа макета: множителя нет, `clamp` макета как есть.
// Карточные и плиточные заголовки — Inter полужирный обычным регистром (макет по
// коду держит Barlow 900 16–20px, по стенду заказчик выбрал Inter — записано); базовое
// правило display-шрифта — только `h1`/`h2`, секционные — классом `.t-h2`.
//
// Считает по тексту `globals.css`: `clamp(min, vw, max)` на 1440 → px.

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WEB_ROOT } from '../web-root';

const GLOBALS = readFileSync(path.join(WEB_ROOT, 'src/app/globals.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

/**
 * Тело CSS-правила по селектору. Правило обязано быть ОДНО: второе объявление
 * (`.t-h2 { … }` ниже по файлу) перекрыло бы первое каскадом, а сторож, читающий
 * первое вхождение, этого не заметил бы (ревью 38.109, дыра «в»).
 */
export function ruleBody(css: string, selector: string): string | null {
  const pattern = new RegExp(`(^|[\\s}])${selector.replace(/[.]/g, '\\.')}\\s*\\{`, 'g');
  const matches = [...css.matchAll(pattern)];
  if (matches.length !== 1) return null;
  const open = css.indexOf('{', matches[0].index);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

/** Значение свойства из тела правила. */
function prop(body: string, name: string): string | null {
  const match = new RegExp(`(?:^|;|\\s)${name}\\s*:\\s*([^;]+);`).exec(body);
  return match ? match[1].replace(/\s+/g, ' ').trim() : null;
}

/** `clamp(2.8rem, 5vw, 4.6rem)` → кегль в px на ширине окна `viewport`. */
export function clampPx(value: string, viewport: number): number | null {
  const m = /clamp\(\s*([\d.]+)rem\s*,\s*([\d.]+)vw\s*,\s*([\d.]+)rem\s*\)/.exec(value);
  if (!m) return null;
  const [min, vw, max] = [Number(m[1]) * 16, (Number(m[2]) / 100) * viewport, Number(m[3]) * 16];
  return Math.min(Math.max(min, vw), max);
}

describe('Сторож: шкала заголовков по макету (38.109)', () => {
  it('множителя кегля display-шрифта нет: размеры — литералы макета', () => {
    expect(GLOBALS).not.toContain('--ui-scale-display');
  });

  it('H1 героя, H1 страницы и H2 секций — clamp макета: 1440 → 72 / 64 / 43,2; 1920 → 73,6 / 64 / 44,8; 390 → минимумы', () => {
    const hero = prop(ruleBody(GLOBALS, '.t-hero') ?? '', 'font-size') ?? '';
    const h1 = prop(ruleBody(GLOBALS, '.t-h1') ?? '', 'font-size') ?? '';
    const h2 = prop(ruleBody(GLOBALS, '.t-h2') ?? '', 'font-size') ?? '';

    expect(clampPx(hero, 1440)).toBeCloseTo(72, 1);
    // Потолок макета 4rem — на 1440 его и достигает (4,5vw = 64,8 > 64).
    expect(clampPx(h1, 1440)).toBeCloseTo(64, 1);
    expect(clampPx(h2, 1440)).toBeCloseTo(43.2, 1);
    // Потолки (2k): 4.6rem / 4rem / 2.8rem — здесь ловится сдвинутый максимум.
    expect(clampPx(hero, 1920)).toBeCloseTo(73.6, 1);
    expect(clampPx(h1, 1920)).toBeCloseTo(64, 1);
    expect(clampPx(h2, 1920)).toBeCloseTo(44.8, 1);
    // Текучесть: на 390 — минимумы макета (2.8rem / 2.4rem / 1.8rem).
    expect(clampPx(hero, 390)).toBeCloseTo(44.8, 1);
    expect(clampPx(h1, 390)).toBeCloseTo(38.4, 1);
    expect(clampPx(h2, 390)).toBeCloseTo(28.8, 1);
  });

  it('базовое правило display-шрифта — только h1 и h2; h3 без класса — шрифт текста', () => {
    // Весь слой base: любое правило, где h3 получает display-шрифт (в общем селекторе
    // или своим правилом), — красное (ревью 38.109, дыра «а»).
    // Слой base — один: второй `@layer base { h3 { … } }` ниже по файлу сторож бы не прочёл.
    expect(GLOBALS.match(/@layer base \{/g)).toHaveLength(1);
    const base = /@layer base \{([\s\S]*?)\n\}/.exec(GLOBALS)?.[1] ?? '';
    const rules = [...base.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: m[1].split(',').map((sel) => sel.trim()),
      body: m[2],
    }));
    const displayRules = rules.filter((r) =>
      /font-family:\s*var\(--ui-font-display\)/.test(r.body),
    );
    expect(displayRules.map((r) => r.selectors)).toEqual([['h1', 'h2']]);
    expect(rules.some((r) => r.selectors.includes('h3'))).toBe(false);
  });

  it('карточные заголовки .t-h3/.t-h4 — Inter полужирный обычным регистром; .t-card-title — 19px/700', () => {
    for (const selector of ['.t-h3', '.t-h4', '.t-card-title']) {
      const body = ruleBody(GLOBALS, selector) ?? '';
      expect(prop(body, 'font-family'), selector).toBe('var(--ui-font-body)');
      expect(prop(body, 'text-transform'), selector).toBeNull();
    }
    expect(prop(ruleBody(GLOBALS, '.t-h3') ?? '', 'font-size')).toBe('20px');
    expect(prop(ruleBody(GLOBALS, '.t-h3') ?? '', 'font-weight')).toBe('600');
    expect(prop(ruleBody(GLOBALS, '.t-h4') ?? '', 'font-size')).toBe('16px');
    expect(prop(ruleBody(GLOBALS, '.t-h4') ?? '', 'font-weight')).toBe('600');
    // Имя клуба в карточке витрины — макет `HomePage.tsx:99`: 19px, вес 900 Barlow → 700 Inter.
    expect(prop(ruleBody(GLOBALS, '.t-card-title') ?? '', 'font-size')).toBe('19px');
    expect(prop(ruleBody(GLOBALS, '.t-card-title') ?? '', 'font-weight')).toBe('700');
    expect(prop(ruleBody(GLOBALS, '.t-card-title') ?? '', 'line-height')).toBe('1');
  });

  it('обратная половина: разбор clamp и правил на подставном тексте', () => {
    expect(clampPx('clamp(1.8rem, 3vw, 2.8rem)', 1440)).toBeCloseTo(43.2, 1);
    expect(clampPx('clamp(1.8rem, 3vw, 2.8rem)', 2000)).toBeCloseTo(44.8, 1);
    expect(clampPx('36px', 1440)).toBeNull();
    expect(ruleBody('.t-h2 {\n  font-size: 1px;\n}', '.t-h2')).toContain('font-size: 1px');
    // Второе правило с тем же селектором — разбора нет: дубль перекрыл бы первое каскадом.
    expect(ruleBody('.t-h2 { a: 1; }\n.t-h2 { a: 2; }', '.t-h2')).toBeNull();
    // `.t-h2` не путается с `.t-h2x` и не ловит `.t-h2` внутри селектора-потомка.
    expect(ruleBody('.t-h2x { a: 1; }\n.t-h2 { a: 2; }', '.t-h2')).toContain('a: 2');
    expect(prop('font-family: var(--ui-font-body); font-weight: 600;', 'font-weight')).toBe('600');
  });
});
