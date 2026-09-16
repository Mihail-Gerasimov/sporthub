/**
 * Контракт адаптива (шаги 38.84–38.85): брейкпоинты по содержимому, не под устройства.
 *
 * ⚠️ Зачем. Точки перестроения выбираются по тому, что на экране перестаёт помещаться,
 * и объявляются ОДИН раз — в `globals.css` (`--breakpoint-*`), семь точек. Медиазапрос
 * или вариант `min-[Npx]:` с числом мимо словаря — точка «под телефон», которую никто
 * не переобъявит при смене устройства; фиксированная минимальная ширина блока от 320px —
 * горизонтальная прокрутка на узком экране (диверсия д-32: `min-w-[480px]` на сетке
 * выдачи).
 *
 * Что закреплено:
 *   1. словарь точек — ровно семь, значения и имена; `md`/`lg`/`xl` — умолчания Tailwind
 *      (768/1024/1280), их не переобъявляют;
 *   2. в коде фронта нет ширин в медиазапросах и вариантах вне словаря;
 *   3. в коде фронта нет `min-w-[N]` от 320px (и от 20rem);
 *   4. правая колонка героя есть только с `xl` (принятое отступление 24b: эталон прячет
 *      с 1100, у нас точка 1280);
 *   5. сетки: «возможности» 1→2→4 (`sm`/`lg`), «три шага» 1→3 (`md`); карусели витрины
 *      «Клубы» 1→2→3 и «Тренеры» 1→2→4 (`md`/`xl`) на главной и выдача клубов/тренеров
 *      теми же слайдами на `/catalog` (38.79b: рабочая часть уехала на каталог).
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
}));

import { fixtureClub, fixtureClub2, fixtureClub3, fixtureSports } from '@sporthub/fixtures';

import { ClubList } from '@/components/clubs/ClubList';
import type { HomeData } from '@/components/home/home-data';
import { HomeFeatures } from '@/components/home/HomeFeatures';
import { HomeHero } from '@/components/home/HomeHero';
import { HomeClubs, HomeTrainers } from '@/components/home/HomeShowcase';
import { HomeSteps } from '@/components/home/HomeSteps';
import { TrainerList } from '@/components/trainers/TrainerList';
import type { TrainerDirectoryItem } from '@/components/trainers/trainer-preview';
import { useFilterStore } from '@/stores/useFilterStore';
import { setMediaQueryMatches } from '@/test/setup';

import { WEB_ROOT } from '../web-root';

/**
 * Семь точек площадки — по содержимому:
 *   sm 480 — большой телефон: две плитки «возможностей» в ряд (ниже — столбик);
 *   md 768 — планшет: док уходит, «три шага» и лидеры в ряд, выдача по две;
 *   menu 960 — пять пунктов, колокольчик и плашка человека помещаются в шапку;
 *   lg 1024 — четыре плитки «возможностей» в ряд;
 *   xl 1280 — правая колонка героя, выдача клубов по три, тренеров по четыре;
 *   xxl 1440 — потолок контейнера;
 *   2k 1920 — FullHD.
 */
const BREAKPOINTS: Record<string, number> = {
  sm: 480,
  md: 768,
  menu: 960,
  lg: 1024,
  xl: 1280,
  xxl: 1440,
  '2k': 1920,
};

/** Умолчания Tailwind — их не переобъявляют в `globals.css`. */
const TAILWIND_DEFAULTS = ['md', 'lg', 'xl'];

const ALLOWED_WIDTHS = new Set(Object.values(BREAKPOINTS));

/** Порог фиксированной минимальной ширины: от 320px блок не влезает в узкий экран. */
const MIN_WIDTH_LIMIT_PX = 320;
const MIN_WIDTH_LIMIT_REM = 20;

/** Файлы фронта: `.tsx`, `.ts` и `.css` без тестов. */
async function collectSources(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const found: string[] = [];

  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    const relative = path.relative(WEB_ROOT, full).split(path.sep).join('/');

    if (relative.startsWith('src/test')) continue;

    if (entry.isDirectory()) found.push(...(await collectSources(full)));
    else if (/\.(tsx|ts|css)$/.test(entry.name)) found.push(relative);
  }

  return found;
}

/** Ширины из медиазапросов и вариантов `min-[…]:`/`max-[…]:` — мимо словаря. */
export function foreignWidths(text: string): string[] {
  const found: string[] = [];

  for (const match of text.matchAll(/\((?:min|max)-width:\s*(\d+)px\)/g)) {
    if (!ALLOWED_WIDTHS.has(Number(match[1]))) found.push(match[0]);
  }
  for (const match of text.matchAll(/\b(?:min|max)-\[(\d+)px\]:/g)) {
    if (!ALLOWED_WIDTHS.has(Number(match[1]))) found.push(match[0]);
  }

  return found;
}

/** Классы `min-w-[N]` от порога — блок, который не влезет в узкий экран. */
export function wideMinWidths(text: string): string[] {
  const found: string[] = [];

  for (const match of text.matchAll(/\bmin-w-\[(\d+(?:\.\d+)?)(px|rem)\]/g)) {
    const value = Number(match[1]);
    const tooWide = match[2] === 'px' ? value >= MIN_WIDTH_LIMIT_PX : value >= MIN_WIDTH_LIMIT_REM;

    if (tooWide) found.push(match[0]);
  }

  return found;
}

const clubs = [fixtureClub, fixtureClub2, fixtureClub3];

/** Тренер справочника — минимум полей, чтобы карточка отрисовалась; выдаче нужно четыре. */
function trainer(id: number): TrainerDirectoryItem {
  return {
    id,
    name: `Тренер ${id}`,
    slug: `trainer-${id}`,
    bio: 'Описание',
    avatarUrl: '',
    experienceYears: 5,
    specialtyIds: [],
    specialtyNames: [],
    rating: 4.5,
    reviewCount: 3,
    priceFrom: 1000,
    sportIds: [1],
    sports: [{ id: 1, name: 'Йога', icon: '🧘' }],
    city: 'Самара',
    address: 'ул. Ленина, 2',
    coordinates: { lat: 53.2, lng: 50.1 },
    venueName: null,
    venueLabel: '',
    venueAddress: '',
    primaryOfferingId: null,
    primaryOfferingTitle: null,
    primaryOfferingFormat: null,
    nextSlotId: null,
    nextSlotDate: null,
    nextSlotStartTime: null,
    availableSlotsCount: 0,
    offeringTitles: [],
    offerings: [],
    searchText: `тренер ${id} йога самара`,
  };
}

const trainers = [trainer(1), trainer(2), trainer(3), trainer(4)];

/** Данные дня витрины (38.79b): каруселям нужны клубы и тренеры, остальное пусто. */
const homeData: HomeData = {
  overview: { athletes: 0, trainers: 0, clubs: 0, reviews: 0 },
  sports: fixtureSports,
  tags: [],
  upcomingSessions: [],
  upcomingSessionsLabel: '16 сентября',
  showcaseClubs: clubs,
  showcaseTrainers: trainers,
};

/**
 * Сколько слайдов в ряд — по ширине слайда: слайдер пишет `calc(100% / N)`, jsdom
 * вычисляет до `calc(33.3333%)`; обратно — округлением 100 / доля.
 */
function visibleSlides(): number {
  const slide = document.querySelector<HTMLElement>('[data-card-slider-slide]');
  const basis = slide?.style.flexBasis ?? '';
  const percent = /([\d.]+)%/.exec(basis);

  return percent === null ? 0 : Math.round(100 / Number(percent[1]));
}

describe('Контракт адаптива: семь точек по содержимому (38.84)', () => {
  it('словарь точек в globals.css — sm/menu/xxl/2k объявлены, md/lg/xl — умолчания Tailwind', async () => {
    const css = await readFile(path.join(WEB_ROOT, 'src/app/globals.css'), 'utf8');
    const declared = new Map(
      [...css.matchAll(/--breakpoint-([a-z0-9]+):\s*(\d+)px/g)].map((m) => [m[1], Number(m[2])]),
    );

    for (const [name, width] of Object.entries(BREAKPOINTS)) {
      if (TAILWIND_DEFAULTS.includes(name)) expect(declared.has(name), name).toBe(false);
      else expect(declared.get(name), name).toBe(width);
    }
    expect([...declared.keys()].sort()).toEqual(
      Object.keys(BREAKPOINTS)
        .filter((name) => !TAILWIND_DEFAULTS.includes(name))
        .sort(),
    );
  });

  it('ни одной ширины в медиазапросах и вариантах вне словаря', async () => {
    const files = await collectSources(path.join(WEB_ROOT, 'src'));
    const violations: string[] = [];

    for (const file of files) {
      const text = await readFile(path.join(WEB_ROOT, file), 'utf8');
      for (const width of foreignWidths(text)) violations.push(`${file}: ${width}`);
    }

    expect(violations).toEqual([]);
  });

  it('ни одного `min-w-[N]` от 320px / 20rem — блок обязан влезать в узкий экран (д-32)', async () => {
    const files = await collectSources(path.join(WEB_ROOT, 'src'));
    const violations: string[] = [];

    for (const file of files) {
      const text = await readFile(path.join(WEB_ROOT, file), 'utf8');
      for (const width of wideMinWidths(text)) violations.push(`${file}: ${width}`);
    }

    expect(violations).toEqual([]);
  });

  it('обратная половина: сторож видит слайдер и globals.css, находит чужую ширину и широкий min-w', async () => {
    const files = await collectSources(path.join(WEB_ROOT, 'src'));
    expect(files).toContain('src/components/ui/CardSlider.tsx');
    expect(files).toContain('src/app/globals.css');
    expect(foreignWidths("window.matchMedia('(min-width: 390px)')")).toHaveLength(1);
    expect(foreignWidths('className="min-[900px]:grid-cols-3"')).toHaveLength(1);
    expect(foreignWidths("matchMedia('(min-width: 768px)')")).toEqual([]);
    expect(wideMinWidths('className="grid min-w-[480px] gap-4"')).toEqual(['min-w-[480px]']);
    expect(wideMinWidths('className="min-w-[180px] min-w-[18px]"')).toEqual([]);
  });
});

describe('Контракт адаптива: колонка героя и сетки (38.85)', () => {
  beforeEach(() => {
    setMediaQueryMatches({});
    useFilterStore.setState({
      discoveryMode: 'clubs',
      searchQuery: '',
      selectedSportId: null,
      selectedCity: 'Самара',
    });
  });

  it('правая колонка героя есть только с xl (отступление 24b)', () => {
    render(<HomeHero focus={{ sessions: [], dateLabel: '16 сентября' }} />);
    const aside = document.querySelector('[data-hero-aside]');
    expect(aside?.className).toContain('hidden');
    expect(aside?.className).toContain('xl:block');
    expect(aside?.className).not.toMatch(/\b(sm|md|lg):block\b/);
  });

  it('«возможности» — две плитки в ряд с базы, четыре с lg (макет: 2 колонки до 1100); «три шага» — столбик, три с md; лидеры — 1→2 с md', () => {
    render(<HomeFeatures />);
    const features = screen.getByRole('list');
    // Макет (`HomePage.tsx:243-262`): плитки парами на любой ширине, четыре в ряд с широких.
    expect(features.className).toContain('grid-cols-2');
    expect(features.className).toContain('lg:grid-cols-4');
    expect(features.className).not.toMatch(/\bgrid-cols-1\b|sm:grid-cols-2/);

    const { container: stepsRoot } = render(<HomeSteps />);
    const steps = stepsRoot.querySelector('ol');
    expect(steps?.className).toContain('grid-cols-1');
    expect(steps?.className).toContain('md:grid-cols-3');
  });

  const NARROW = {};
  const MD = { '(min-width: 768px)': true };
  const XL = { '(min-width: 768px)': true, '(min-width: 1280px)': true };

  // 38.106: витрина — с lg сетка макета (клубы 3×2, тренеры четыре в ряд) на том же
  // `CardSlider`; ниже lg — карусель со свайпом: узкий 1, md 2.
  const LG = { '(min-width: 768px)': true, '(min-width: 1024px)': true };

  it.each([
    { label: 'узкий', matches: NARROW, expected: 1 },
    { label: 'md', matches: MD, expected: 2 },
  ])('карусель «Клубы» витрины ниже lg: $label — $expected в ряд', ({ matches, expected }) => {
    setMediaQueryMatches(matches);
    render(<HomeClubs data={homeData} />);
    expect(visibleSlides()).toBe(expected);
  });

  it.each([
    { label: 'узкий', matches: NARROW, expected: 1 },
    { label: 'md', matches: MD, expected: 2 },
  ])('карусель «Тренеры» витрины ниже lg: $label — $expected в ряд', ({ matches, expected }) => {
    setMediaQueryMatches(matches);
    render(<HomeTrainers data={homeData} />);
    expect(visibleSlides()).toBe(expected);
  });

  it('витрина с lg — сетка: клубы 3 колонки, тренеры 4; лента не сдвигается, стрелки и точки спрятаны', () => {
    setMediaQueryMatches(LG);
    const { container: clubsRoot } = render(<HomeClubs data={homeData} />);
    const clubsRail = clubsRoot.querySelector<HTMLElement>('[data-card-slider-rail]');
    expect(clubsRail?.className).toContain('lg:grid-cols-3');
    expect(clubsRail?.style.transform).toBe('');
    // Не только классами: на lg листать нечего — «Вперёд» выключена, drag ленту не двигает.
    expect(clubsRoot.querySelector('[aria-label="Вперёд"]')).toBeDisabled();
    const wrapper = clubsRail?.parentElement as HTMLElement;
    fireEvent.pointerDown(wrapper, { clientX: 300, pointerId: 1, button: 0 });
    fireEvent.pointerMove(wrapper, { clientX: 100, pointerId: 1 });
    expect(clubsRail?.style.transform).toBe('');
    // Стрелки и точки спрятаны с lg — на обёртке, одним классом.
    expect(clubsRoot.querySelector('[aria-label="Вперёд"]')?.parentElement?.className).toContain(
      'lg:hidden',
    );

    const { container: trainersRoot } = render(<HomeTrainers data={homeData} />);
    expect(trainersRoot.querySelector('[data-card-slider-rail]')?.className).toContain(
      'lg:grid-cols-4',
    );
  });

  it.each([
    { label: 'узкий', matches: NARROW, expected: 1 },
    { label: 'md', matches: MD, expected: 2 },
    { label: 'xl', matches: XL, expected: 3 },
  ])('выдача клубов на каталоге: $label — $expected в ряд (1→2→3)', ({ matches, expected }) => {
    setMediaQueryMatches(matches);
    render(<ClubList clubs={clubs} sports={fixtureSports} tags={[]} />);
    expect(visibleSlides()).toBe(expected);
  });

  it.each([
    { label: 'узкий', matches: NARROW, expected: 1 },
    { label: 'md', matches: MD, expected: 2 },
    { label: 'xl', matches: XL, expected: 4 },
  ])('выдача тренеров на каталоге: $label — $expected в ряд (1→2→4)', ({ matches, expected }) => {
    setMediaQueryMatches(matches);
    useFilterStore.setState({ discoveryMode: 'trainers' });
    render(<TrainerList trainers={trainers} />);
    expect(visibleSlides()).toBe(expected);
  });
});
