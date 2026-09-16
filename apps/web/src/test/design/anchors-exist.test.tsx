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

import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  notFound: () => {
    throw new Error('Not found');
  },
}));

import Home from '@/app/page';
import { AppShell } from '@/components/layout/AppShell';
import { HOME_SECTIONS } from '@/lib/home-sections';
import { useFilterStore } from '@/stores/useFilterStore';
import { installApiStub, type ApiStub } from '@/test/helpers/api-stub';
import { createFixtureRoutes } from '@/test/helpers/fixture-routes';

const MODES = ['clubs', 'trainers'] as const;

/** Якорная часть адреса: `#results` и `/#results` — одна и та же цель. */
function anchorOf(href: string): string | null {
  const match = /^\/?#(.+)$/.exec(href);

  return match === null ? null : match[1];
}

/** Секции верхнего уровня внутри `main`: без вложенных в другую секцию. */
function topLevelSections(): HTMLElement[] {
  const main = document.querySelector('main');

  if (main === null) return [];

  return [...main.querySelectorAll<HTMLElement>('section[id]')].filter(
    (section) => section.parentElement?.closest('section') === null,
  );
}

const DICTIONARY_IDS: string[] = Object.values(HOME_SECTIONS).map((section) => section.id);

for (const mode of MODES) {
  describe(`Якоря и секции главной — режим «${mode}»`, () => {
    let stub: ApiStub;

    beforeEach(() => {
      stub = installApiStub(createFixtureRoutes());
      useFilterStore.setState({ discoveryMode: mode, searchQuery: '', selectedSportId: null });
    });

    afterEach(() => {
      stub?.restore();
    });

    it('каждая ссылка-якорь в каркасе и на главной ведёт на существующий элемент', async () => {
      render(<AppShell>{await Home()}</AppShell>);

      const anchors = [...document.querySelectorAll<HTMLAnchorElement>('a[href]')]
        .map((link) => link.getAttribute('href') ?? '')
        .map(anchorOf)
        .filter((id): id is string => id !== null);

      // Сторож самого теста: без якорей «все ведут куда надо» означало бы «ссылок
      // не нашлось» — ложная зелень, на которой проект уже горел.
      expect(anchors.length).toBeGreaterThan(0);

      const dead = [...new Set(anchors)].filter((id) => document.getElementById(id) === null);

      expect(dead, `якоря без цели: ${dead.map((id) => `#${id}`).join(', ')}`).toEqual([]);
    });

    it('каждая секция словаря отрисована, и ни один её id не встречается дважды', async () => {
      render(<AppShell>{await Home()}</AppShell>);

      const missing = DICTIONARY_IDS.filter((id) => document.getElementById(id) === null);

      expect(missing, `секции словаря без разметки: ${missing.join(', ')}`).toEqual([]);

      const duplicates = DICTIONARY_IDS.filter(
        (id) => document.querySelectorAll(`[id="${id}"]`).length > 1,
      );

      expect(duplicates, `id встречается дважды: ${duplicates.join(', ')}`).toEqual([]);
    });

    it('каждая секция верхнего уровня внутри main объявлена в словаре', async () => {
      render(<AppShell>{await Home()}</AppShell>);

      const sections = topLevelSections();

      expect(sections.length).toBeGreaterThan(0);

      const stray = sections
        .map((section) => section.id)
        .filter((id) => !DICTIONARY_IDS.includes(id));

      expect(stray, `секции мимо словаря: ${stray.join(', ')}`).toEqual([]);
    });

    it('«Выдача» — карточки, а не карта; подпись секции в разметке равна подписи в словаре', async () => {
      render(<AppShell>{await Home()}</AppShell>);

      const cards = 'article[aria-label^="Карточка"]';
      const results = document.getElementById(HOME_SECTIONS.results.id);
      const map = document.getElementById(HOME_SECTIONS.map.id);

      expect(results?.querySelectorAll(cards).length).toBeGreaterThan(0);
      expect(map?.querySelector(cards)).toBeNull();

      // Пункт меню подписан из словаря — секция обязана называться так же (диверсия:
      // литерал «Подборки» в aria-label формы поиска).
      const lying = topLevelSections()
        .filter((section) => section.hasAttribute('aria-label'))
        .map((section) => ({
          id: section.id,
          label: section.getAttribute('aria-label'),
          expected: Object.values(HOME_SECTIONS).find((entry) => entry.id === section.id)?.label,
        }))
        .filter((entry) => entry.label !== entry.expected);

      expect(lying, `подпись врёт: ${JSON.stringify(lying)}`).toEqual([]);
    });
  });
}
