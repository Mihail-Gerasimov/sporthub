/**
 * Словарь навигации (шаги 38.56, 38.79c): шапка по макету — «Клубы», «Тренеры»,
 * «Как это работает», «Возможности», «Командные», «Маркет»; подвал повторяет шапку;
 * док — Главная, Каталог, Слоты. Рабочая часть живёт на `/catalog`, поэтому «Клубы»
 * и «Тренеры» ведут на выдачу каталога и несут режим стора: клик переключает
 * `discoveryMode`, как чип сегмента. Прямой заход по адресу открывает режим по
 * умолчанию — принятое ограничение (Д-15: режим и фильтры в адресе).
 */
import { describe, expect, it } from 'vitest';

import { catalogSectionHref } from '@/lib/catalog-sections';
import { homeSectionHref } from '@/lib/home-sections';
import { FOOTER_NAV, HEADER_NAV, MOBILE_NAV } from '@/lib/navigation';

describe('Словарь навигации', () => {
  it('шапка — по макету: каталог в двух режимах, две секции витрины, два раздела вне фазы', () => {
    expect(HEADER_NAV.map((item) => [item.label, item.href, item.mode ?? null])).toEqual([
      ['Клубы', catalogSectionHref('results'), 'clubs'],
      ['Тренеры', catalogSectionHref('results'), 'trainers'],
      ['Как это работает', homeSectionHref('steps'), null],
      ['Возможности', homeSectionHref('features'), null],
      ['Командные', '/coming-soon', null],
      ['Маркет', '/coming-soon', null],
    ]);
  });

  it('подвал — те же пункты, что в шапке', () => {
    expect(FOOTER_NAV).toBe(HEADER_NAV);
  });

  it('док — главная, каталог и слоты каталога; режим у пунктов дока не задаётся', () => {
    expect(MOBILE_NAV.map((item) => [item.label, item.href])).toEqual([
      ['Главная', '/'],
      ['Каталог', '/catalog'],
      ['Слоты', catalogSectionHref('availability')],
    ]);
    expect(MOBILE_NAV.every((item) => item.mode === undefined)).toBe(true);
  });

  it('ни один пункт не ведёт на якорь главной, которого нет в словаре рабочей части', () => {
    // Рабочая часть уехала на каталог: `/#discover`, `/#results`, `/#availability` — тупики.
    const homeAnchors = ['/#discover', '/#map', '/#results', '/#availability'];
    for (const item of [...HEADER_NAV, ...MOBILE_NAV]) {
      expect(homeAnchors, item.label).not.toContain(item.href);
    }
  });
});
