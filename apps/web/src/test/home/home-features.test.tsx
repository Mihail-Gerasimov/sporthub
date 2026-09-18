// Тесты секции «Возможности»: в боевой витрине только работающие разделы.
//
// Здесь у каждой плитки цель СУЩЕСТВУЕТ и закреплена ПАРОЙ «плитка → цель» по ключу
// записи словаря: якорь — из словаря секций каталога, маршрут — файл `src/app/**/page.tsx`;
// четыре плитки без раздела ведут на «раздел в разработке» — один адрес, и он тоже файл.
// Гостю раздел кабинета — тупик (`307 → /` без возврата), поэтому гостю такая плитка
// открывает модалку входа, как «Попробовать бесплатно» справа от заголовка;
// вошедшему — ссылка. Иконки и тона — по ключу, ни один тон не повторяется.

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { HomeFeatures } from '@/components/home/HomeFeatures';
import { catalogSectionHref } from '@/lib/catalog-sections';
import { FEATURES } from '@/lib/home-copy';
import { HOME_SECTIONS } from '@/lib/home-sections';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';
import { collectRoutes, routeExists } from '@/test/helpers/app-routes';
import { WEB_ROOT } from '@/test/web-root';

type FeatureKey = (typeof FEATURES.items)[number]['key'];

/** Пары «ключ плитки → цель», закреплённые по словарю. */
const EXPECTED_TARGETS: Record<FeatureKey, string> = {
  booking: catalogSectionHref('availability'),
  stats: '/profile/me/stats',
};

/** Подложки по ключу — цвета макета (`HomePage.tsx:227-236`). */
const EXPECTED_SURFACE: Record<FeatureKey, string> = {
  booking: 'bg-tint-lime',
  stats: 'bg-tint-sky',
};

/** Плитки кабинета — гостю кнопки входа. */
const CABINET_KEYS: FeatureKey[] = ['stats'];

function signIn() {
  useAuthStore.setState({
    ...AUTH_STORE_DEFAULT_STATE,
    user: { name: 'Марина Крылова', email: 'marina@studio.local' },
    isAuthenticated: true,
    accountKind: 'person',
    status: 'ready',
  });
}

const section = () => screen.getByRole('region', { name: HOME_SECTIONS.features.label });

/** Плитка по ключу словаря — интерактив, внутри которого стоит её заголовок. */
function tileOf(key: FeatureKey): HTMLElement {
  const item = FEATURES.items.find((feature) => feature.key === key)!;
  const title = within(section()).getByText(item.title);
  const tile = title.closest('a, button');

  if (tile === null) throw new Error(`плитка «${item.title}» не интерактив`);

  return tile as HTMLElement;
}

describe('HomeFeatures', () => {
  beforeEach(() => {
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
    useUIStore.setState({ isAuthModalOpen: false });
  });

  it('якорь и подпись секции — из записи словаря секций', () => {
    render(<HomeFeatures />);

    expect(section().id).toBe(HOME_SECTIONS.features.id);
  });

  it('плитки работающих возможностей — тексты словаря в его порядке', () => {
    signIn();
    render(<HomeFeatures />);

    const items = within(section()).getAllByRole('listitem');

    expect(items).toHaveLength(2);
    expect(FEATURES.items).toHaveLength(2);
    items.forEach((item, index) => {
      expect(within(item).getByText(FEATURES.items[index].title)).toBeInTheDocument();
      expect(within(item).getByText(FEATURES.items[index].body)).toBeInTheDocument();
    });
  });

  it('вошедшему каждая плитка — ссылка на СВОЮ цель по ключу, и цель существует файлом', async () => {
    signIn();
    render(<HomeFeatures />);

    const routes = await collectRoutes();

    for (const feature of FEATURES.items) {
      const tile = tileOf(feature.key);

      expect(tile.tagName, `«${feature.title}»`).toBe('A');
      expect(tile.getAttribute('href'), `цель «${feature.title}»`).toBe(
        EXPECTED_TARGETS[feature.key],
      );
    }
    // Все цели — фиксированные маршруты (`/catalog#…`, `/profile/me/*`, `/coming-soon`):
    // подстановка `[faceKind]/[faceId]` под `/profile/me/что-угодно` дала бы ложный зелёный.
    for (const href of new Set(Object.values(EXPECTED_TARGETS))) {
      expect(routeExists(href, routes, { staticOnly: true }), `цель «${href}»`).toBe(true);
    }
  });

  it('гостю плитки кабинета — кнопки входа; остальные — ссылки; клик открывает модалку', () => {
    render(<HomeFeatures />);

    for (const feature of FEATURES.items) {
      const tile = tileOf(feature.key);
      const gated = CABINET_KEYS.includes(feature.key);

      expect(tile.tagName, `«${feature.title}»`).toBe(gated ? 'BUTTON' : 'A');
    }
    expect(useUIStore.getState().isAuthModalOpen).toBe(false);
    fireEvent.click(tileOf('stats'));
    expect(useUIStore.getState().isAuthModalOpen).toBe(true);
  });

  it('у каждой плитки свой тон ПО КЛЮЧУ: подложка макета и значок в тон, ни один не повторяется', () => {
    signIn();
    render(<HomeFeatures />);

    const tones = new Set<string>();

    for (const feature of FEATURES.items) {
      const tile = tileOf(feature.key);
      const tone = tile
        .querySelector('svg')
        ?.parentElement?.className.match(/\btext-[a-z-]+\b/)?.[0];

      expect(tile.className, `подложка «${feature.title}»`).toContain(
        EXPECTED_SURFACE[feature.key],
      );
      expect(tone, `тон значка «${feature.title}»`).toBeDefined();
      tones.add(tone ?? '');
    }
    expect(tones.size).toBe(FEATURES.items.length);
  });

  it('каждый тон плитки — токен в globals.css: подложка bg-tint-* и значок text-hue-*/text-red/text-orange', async () => {
    signIn();
    render(<HomeFeatures />);

    const css = await readFile(path.join(WEB_ROOT, 'src', 'app', 'globals.css'), 'utf8');
    const missing: string[] = [];

    for (const feature of FEATURES.items) {
      const tile = tileOf(feature.key);
      const surface = tile.className.match(/\bbg-tint-([a-z]+)\b/)?.[1];
      const tone = tile
        .querySelector('svg')
        ?.parentElement?.className.match(/\btext-([a-z-]+)\b/)?.[1];

      if (surface === undefined || !css.includes(`--color-tint-${surface}:`)) {
        missing.push(`${feature.key}: подложка ${surface ?? '—'}`);
      }
      // Тон значка: `hue-*` — свой токен, `lime`/`red`/`orange` — базовые цвета палитры.
      if (tone === undefined || !css.includes(`--color-${tone}:`)) {
        missing.push(`${feature.key}: значок ${tone ?? '—'}`);
      }
    }

    expect(missing, missing.join('\n')).toEqual([]);
  });

  it('иконки — lucide по ключу, у каждой плитки своя, скрыты от диктора', () => {
    signIn();
    render(<HomeFeatures />);

    const svgs = FEATURES.items.map((feature) => tileOf(feature.key).querySelector('svg'));

    expect(svgs.every((svg) => svg?.getAttribute('aria-hidden') === 'true')).toBe(true);
    expect(new Set(svgs.map((svg) => svg?.innerHTML)).size).toBe(FEATURES.items.length);
  });

  it('заголовок плитки — .t-h4 словаря обычным регистром (38.109)', () => {
    signIn();
    render(<HomeFeatures />);

    for (const item of FEATURES.items) {
      const title = within(section()).getByText(item.title);

      expect(title.className).toContain('t-h4');
      expect(title.className).not.toContain('uppercase');
    }
  });

  it('«Попробовать бесплатно»: гостю — модалка регистрации, вошедшему — ссылка в кабинет', () => {
    const { unmount } = render(<HomeFeatures />);

    fireEvent.click(screen.getByRole('button', { name: FEATURES.tryFree }));
    expect(useUIStore.getState().isAuthModalOpen).toBe(true);
    unmount();

    useAuthStore.setState({
      ...AUTH_STORE_DEFAULT_STATE,
      user: { name: 'Марина Крылова', email: 'marina@studio.local' },
      isAuthenticated: true,
      accountKind: 'person',
      faces: [{ kind: 'club', id: 3, name: 'CrossFit Garage' }],
      activeFaceKey: 'club:3',
      status: 'ready',
    });
    render(<HomeFeatures />);
    expect(screen.queryByRole('button', { name: FEATURES.tryFree })).toBeNull();
    expect(screen.getByRole('link', { name: FEATURES.tryFreeAuthenticated })).toHaveAttribute(
      'href',
      '/profile/club/3',
    );
  });
});
