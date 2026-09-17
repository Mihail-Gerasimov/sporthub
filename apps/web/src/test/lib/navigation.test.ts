/**
 * Словарь навигации (шаги 38.56, 38.79c, 38.108, 38.119): шапка — ровно макет
 * (`App.tsx` ~2778): «Клубы», «Тренеры», «Командные», «Маркет»; подвал — свой список
 * ровно по `HomePage.tsx` ~899: «Клубы», «Тренеры», «Маркет», «Лента» (38.119 — отступление
 * 24g снято); док — `BOTTOM_TABS` макета (`App.tsx` ~2700) без «Мой»: Главная, Клубы,
 * Лента, Маркет — «Мой» добавляет компонент, адрес зависит от сессии. Рабочая часть живёт на `/catalog`,
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
import { activeNavKey, FOOTER_NAV, HEADER_NAV, MOBILE_NAV } from '@/lib/navigation';

describe('Словарь навигации', () => {
  it('шапка — ровно макет: каталог в двух режимах и два раздела вне фазы', () => {
    expect(HEADER_NAV.map((item) => [item.key, item.label, item.href, item.mode ?? null])).toEqual([
      ['clubs', 'Клубы', catalogSectionHref('results'), 'clubs'],
      ['trainers', 'Тренеры', catalogSectionHref('results'), 'trainers'],
      ['teams', 'Командные', '/coming-soon', null],
      ['market', 'Маркет', '/coming-soon', null],
    ]);
  });

  it('подвал — свой список ровно по макету: Клубы · Тренеры · Маркет · Лента (38.119)', () => {
    expect(FOOTER_NAV.map((item) => [item.key, item.label, item.href, item.mode ?? null])).toEqual([
      ['clubs', 'Клубы', catalogSectionHref('results'), 'clubs'],
      ['trainers', 'Тренеры', catalogSectionHref('results'), 'trainers'],
      ['market', 'Маркет', '/coming-soon', null],
      ['feed', 'Лента', '/coming-soon', null],
    ]);
    // Пункт, общий с шапкой, — одна запись: адрес и подпись объявлены один раз.
    for (const item of FOOTER_NAV) {
      const twin = HEADER_NAV.find((candidate) => candidate.key === item.key);
      if (twin !== undefined) expect(twin).toBe(item);
    }
  });

  it('док — BOTTOM_TABS макета без «Мой»: главная, клубы (режим клубов), лента и маркет', () => {
    expect(MOBILE_NAV.map((item) => [item.key, item.label, item.href, item.mode ?? null])).toEqual([
      ['home', 'Главная', '/', null],
      // Вкладка каталога — страница целиком: подсветка на любом её якоре, режим — клубы.
      ['clubs', 'Клубы', CATALOG_PATH, 'clubs'],
      ['feed', 'Лента', '/coming-soon', null],
      ['market', 'Маркет', '/coming-soon', null],
    ]);
  });

  it('ключ пункта уникален в своём списке — по нему компонент берёт иконку и React-ключ', () => {
    for (const list of [HEADER_NAV, FOOTER_NAV, MOBILE_NAV]) {
      const keys = list.map((item) => item.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('секции витрины — не пункты меню: их якорей нет ни в шапке, ни в доке', () => {
    const showcaseAnchors = [HOME_SECTIONS.steps, HOME_SECTIONS.features].map(
      (section) => `/#${section.id}`,
    );
    for (const item of [...HEADER_NAV, ...FOOTER_NAV, ...MOBILE_NAV]) {
      expect(showcaseAnchors, item.label).not.toContain(item.href);
    }
  });

  // Аудит 17.09, п. 16: текущий пункт шапки — по пути адреса и режиму стора.
  it('текущий пункт: путь без якоря плюс режим; общий или чужой адрес — никто', () => {
    const catalog = catalogSectionHref('results').split('#')[0];
    expect(activeNavKey(HEADER_NAV, catalog, 'clubs')).toBe('clubs');
    expect(activeNavKey(HEADER_NAV, catalog, 'trainers')).toBe('trainers');
    // «Командные» и «Маркет» делят адрес — выбор по нему не узнать.
    expect(activeNavKey(HEADER_NAV, '/coming-soon', 'clubs')).toBeNull();
    expect(activeNavKey(HEADER_NAV, '/', 'clubs')).toBeNull();
    expect(activeNavKey(HEADER_NAV, null, 'clubs')).toBeNull();
    // Детальная клуба пункт не подсвечивает: корни разделов не объявлены (названо).
    expect(activeNavKey(HEADER_NAV, '/clubs/atlant', 'clubs')).toBeNull();
  });

  it('ни один пункт не ведёт на якорь главной, которого нет в словаре рабочей части', () => {
    // Рабочая часть уехала на каталог: `/#discover`, `/#results`, `/#availability` — тупики.
    const homeAnchors = ['/#discover', '/#map', '/#results', '/#availability'];
    for (const item of [...HEADER_NAV, ...FOOTER_NAV, ...MOBILE_NAV]) {
      expect(homeAnchors, item.label).not.toContain(item.href);
    }
  });
});
