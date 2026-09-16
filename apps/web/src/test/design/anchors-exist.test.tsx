// Сторож: каждый якорь ведёт на существующий элемент, каждая секция главной — из словаря
// (фаза 38, шаг 38.66).
//
// ⚠️ Зачем. Разведка фазы 38 нашла шестнадцать тупиков, и главный их класс — ссылка
// на якорь, которого нет: `#availability` стоял в трёх местах при ОТСУТСТВУЮЩЕЙ секции,
// а тест проверял, что ссылка отрисована с нужным адресом, и не проверял, существует
// ли адрес. Здесь рендерится ВСЁ дерево — каркас (шапка, подвал, мобильный док)
// и главная — и каждый `href="#…"` / `href="/#…"` сверяется с `getElementById`.
//
// Две половины:
//   1. якоря: у каждой ссылки-якоря в документе есть цель (диверсия д-33 — `#nowhere`
//      в шапке); и каждая секция из словаря `HOME_SECTIONS` действительно отрисована;
//   2. секции: каждая `section[id]` верхнего уровня внутри `main` объявлена в словаре
//      (диверсия д-28 — `<section id="community">` вписана в `page.tsx` мимо словаря).
//      Обратная д-29 — секция, добавленная записью словаря плюс компонентом, — зелёная.
//
// ⚠️ Два режима, и оба обязательны: слоты клубов и окна тренеров взаимоисключающие —
// `UpcomingSessions` рисует один из двух блоков по `discoveryMode`, и якорь, живущий
// только в одном режиме, во втором был бы тупиком.
//
// Третья половина (38.89): якорь ведёт туда, что обещает подпись. `#results` из шапки
// скроллил на КАРТУ (реестр № 6), а пункт «Подборки» — на форму поиска (№ 5): цель
// существовала, но врала подпись. Теперь `#results` держит карточки выдачи, у карты
// свой якорь, а подпись секции в разметке равна подписи её записи в словаре.
//
// ⚠️ Две страницы (38.79a): главная со словарём `HOME_SECTIONS` и каталог `/catalog`
// со словарём `CATALOG_SECTIONS` — каждая рендерится в каркасе, каждая сверяется
// со СВОИМ словарём. Якорь-ссылка на другую страницу (`/catalog#results` с главной)
// проверяется по словарю той страницы: цель обязана существовать там.

import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  notFound: () => {
    throw new Error('Not found');
  },
}));

import CatalogPage from '@/app/catalog/page';
import Home from '@/app/page';
import { AppShell } from '@/components/layout/AppShell';
import { CATALOG_SECTIONS, catalogSectionHref } from '@/lib/catalog-sections';
import { HOME_SECTIONS } from '@/lib/home-sections';
import { useFilterStore } from '@/stores/useFilterStore';
import { installApiStub, type ApiStub } from '@/test/helpers/api-stub';
import { createFixtureRoutes } from '@/test/helpers/fixture-routes';

const MODES = ['clubs', 'trainers'] as const;

type SectionEntry = { id: string; label: string };

/** Страницы со словарём секций: что рендерить и с чем сверять. */
const PAGES = [
  {
    name: 'главная',
    path: '/',
    render: Home,
    dictionary: HOME_SECTIONS as Record<string, SectionEntry>,
  },
  {
    name: 'каталог',
    path: catalogSectionHref('results').split('#')[0],
    render: CatalogPage,
    dictionary: CATALOG_SECTIONS as Record<string, SectionEntry>,
  },
] as const;

/** Якорная часть адреса и страница: `#results`, `/#results`, `/catalog#results`. */
function anchorOf(href: string): { path: string; id: string } | null {
  const match = /^(\/[^#?]*)?#(.+)$/.exec(href);

  return match === null ? null : { path: match[1] ?? '', id: match[2] };
}

/** Словарь страницы по её адресу: `''` и `/` — главная. */
function dictionaryFor(path: string): Record<string, SectionEntry> | undefined {
  return PAGES.find((page) => page.path === (path === '' ? '/' : path))?.dictionary;
}

/** Секции верхнего уровня внутри `main`: без вложенных в другую секцию. */
function topLevelSections(): HTMLElement[] {
  const main = document.querySelector('main');

  if (main === null) return [];

  return [...main.querySelectorAll<HTMLElement>('section[id]')].filter(
    (section) => section.parentElement?.closest('section') === null,
  );
}

for (const page of PAGES) {
  const dictionaryIds: string[] = Object.values(page.dictionary).map((section) => section.id);

  for (const mode of MODES) {
    describe(`Якоря и секции: ${page.name} — режим «${mode}»`, () => {
      let stub: ApiStub;

      beforeEach(() => {
        stub = installApiStub(createFixtureRoutes());
        useFilterStore.setState({ discoveryMode: mode, searchQuery: '', selectedSportId: null });
      });

      afterEach(() => {
        stub?.restore();
      });

      it('каждая ссылка-якорь в каркасе и на странице ведёт на существующий элемент', async () => {
        render(<AppShell>{await page.render()}</AppShell>);

        const anchors = [...document.querySelectorAll<HTMLAnchorElement>('a[href]')]
          .map((link) => link.getAttribute('href') ?? '')
          .map(anchorOf)
          .filter((anchor): anchor is { path: string; id: string } => anchor !== null);

        // Сторож самого теста: без якорей «все ведут куда надо» означало бы «ссылок
        // не нашлось» — ложная зелень, на которой проект уже горел.
        expect(anchors.length).toBeGreaterThan(0);

        // Якорь на этой же странице — по разметке; на другую — по её словарю секций.
        const dead = [...new Set(anchors.map((anchor) => `${anchor.path}#${anchor.id}`))].filter(
          (href) => {
            const anchor = anchorOf(href) as { path: string; id: string };
            const samePage = anchor.path === '' || anchor.path === page.path;

            if (samePage) return document.getElementById(anchor.id) === null;

            const target = dictionaryFor(anchor.path);

            return (
              target === undefined ||
              !Object.values(target).some((section) => section.id === anchor.id)
            );
          },
        );

        expect(dead, `якоря без цели: ${dead.join(', ')}`).toEqual([]);
      });

      it('каждая секция словаря отрисована, и ни один её id не встречается дважды', async () => {
        render(<AppShell>{await page.render()}</AppShell>);

        const missing = dictionaryIds.filter((id) => document.getElementById(id) === null);

        expect(missing, `секции словаря без разметки: ${missing.join(', ')}`).toEqual([]);

        const duplicates = dictionaryIds.filter(
          (id) => document.querySelectorAll(`[id="${id}"]`).length > 1,
        );

        expect(duplicates, `id встречается дважды: ${duplicates.join(', ')}`).toEqual([]);
      });

      it('каждая секция верхнего уровня внутри main объявлена в словаре', async () => {
        render(<AppShell>{await page.render()}</AppShell>);

        const sections = topLevelSections();

        expect(sections.length).toBeGreaterThan(0);

        const stray = sections
          .map((section) => section.id)
          .filter((id) => !dictionaryIds.includes(id));

        expect(stray, `секции мимо словаря: ${stray.join(', ')}`).toEqual([]);
      });

      it('подпись секции в разметке равна подписи её записи в словаре', async () => {
        render(<AppShell>{await page.render()}</AppShell>);

        // Пункт меню подписан из словаря — секция обязана называться так же (диверсия:
        // литерал «Подборки» в aria-label формы поиска).
        const lying = topLevelSections()
          .filter((section) => section.hasAttribute('aria-label'))
          .map((section) => ({
            id: section.id,
            label: section.getAttribute('aria-label'),
            expected: Object.values(page.dictionary).find((entry) => entry.id === section.id)
              ?.label,
          }))
          .filter((entry) => entry.label !== entry.expected);

        expect(lying, `подпись врёт: ${JSON.stringify(lying)}`).toEqual([]);
      });
    });
  }
}

for (const mode of MODES) {
  describe(`Каталог: «Выдача» — карточки, а не карта — режим «${mode}»`, () => {
    let stub: ApiStub;

    beforeEach(() => {
      stub = installApiStub(createFixtureRoutes());
      useFilterStore.setState({ discoveryMode: mode, searchQuery: '', selectedSportId: null });
    });

    afterEach(() => {
      stub?.restore();
    });

    it('в #results есть карточки режима, в #map — нет', async () => {
      render(<AppShell>{await CatalogPage()}</AppShell>);

      const cards = 'article[aria-label^="Карточка"]';
      const results = document.getElementById(CATALOG_SECTIONS.results.id);
      const map = document.getElementById(CATALOG_SECTIONS.map.id);

      expect(results?.querySelectorAll(cards).length).toBeGreaterThan(0);
      expect(map?.querySelector(cards)).toBeNull();
    });
  });
}
