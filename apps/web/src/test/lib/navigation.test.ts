/**
 * Словарь навигации (шаги 38.56, 38.79c, 38.108): шапка и подвал — ровно макет
 * (`App.tsx` ~2778, `HomePage.tsx` ~899): «Клубы», «Тренеры», «Командные», «Маркет»;
 * док — `BOTTOM_TABS` макета (`App.tsx` ~2700) без «Мой»: Главная, Клубы, Лента, Маркет —
 * «Мой» добавляет компонент, адрес зависит от сессии. Рабочая часть живёт на `/catalog`,
 * поэтому «Клубы» и «Тренеры» ведут на выдачу каталога и несут режим стора: клик
 * переключает `discoveryMode`, как чип сегмента. Прямой заход по адресу открывает режим
 * по умолчанию — принятое ограничение (Д-15: режим и фильтры в адресе).
 *
 * ⚠️ Секции витрины «Как это работает» и «Возможности» из навигации ушли (38.108);
 * их якоря живут в `HOME_SECTIONS`, и пункт меню им не нужен — сторож `anchors-exist`
 * требует разметку на каждую запись словаря, а не пункт меню на каждую секцию.
 */
import { describe, expect, it } from 'vitest';

import { CATALOG_PATH, catalogSectionHref } from '@/lib/catalog-sections';
import { HOME_SECTIONS } from '@/lib/home-sections';
import { FOOTER_NAV, HEADER_NAV, MOBILE_NAV } from '@/lib/navigation';

describe('Словарь навигации', () => {
  it('шапка — ровно макет: каталог в двух режимах и два раздела вне фазы', () => {
    expect(HEADER_NAV.map((item) => [item.label, item.href, item.mode ?? null])).toEqual([
      ['Клубы', catalogSectionHref('results'), 'clubs'],
      ['Тренеры', catalogSectionHref('results'), 'trainers'],
      ['Командные', '/coming-soon', null],
      ['Маркет', '/coming-soon', null],
    ]);
  });

  it('подвал — те же пункты, что в шапке (один словарь; «Лента» подвала макета не переносится)', () => {
    expect(FOOTER_NAV).toBe(HEADER_NAV);
  });

  it('док — BOTTOM_TABS макета без «Мой»: главная, клубы (режим клубов), лента и маркет', () => {
    expect(MOBILE_NAV.map((item) => [item.label, item.href, item.mode ?? null])).toEqual([
      ['Главная', '/', null],
      // Вкладка каталога — страница целиком: подсветка на любом её якоре, режим — клубы.
      ['Клубы', CATALOG_PATH, 'clubs'],
      ['Лента', '/coming-soon', null],
      ['Маркет', '/coming-soon', null],
    ]);
  });

  it('секции витрины — не пункты меню: их якорей нет ни в шапке, ни в доке', () => {
    const showcaseAnchors = [HOME_SECTIONS.steps, HOME_SECTIONS.features].map(
      (section) => `/#${section.id}`,
    );
    for (const item of [...HEADER_NAV, ...MOBILE_NAV]) {
      expect(showcaseAnchors, item.label).not.toContain(item.href);
    }
  });

  it('ни один пункт не ведёт на якорь главной, которого нет в словаре рабочей части', () => {
    // Рабочая часть уехала на каталог: `/#discover`, `/#results`, `/#availability` — тупики.
    const homeAnchors = ['/#discover', '/#map', '/#results', '/#availability'];
    for (const item of [...HEADER_NAV, ...MOBILE_NAV]) {
      expect(homeAnchors, item.label).not.toContain(item.href);
    }
  });
});
