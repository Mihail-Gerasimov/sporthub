/**
 * MainMap (Step 19.6 + 19.7; 38.80 — вид эталона).
 * Покрывают: skeleton, error, рендер контейнера, инициализация, empty state; маркеры-капли
 * DOM-узлами с цветом вида из данных (не `innerHTML`, не словарь), активное состояние
 * по клику, карточка снизу со ссылкой на страницу, легенда по видам на карте.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from '@sporthub/types';

import { WEB_ROOT } from '../web-root';

/* --- Мокаем useYandexMap — управляем isLoaded из тестов --- */
const mockUseYandexMap = vi.fn();

vi.mock('@/components/map/YandexMapProvider', () => ({
  useYandexMap: () => mockUseYandexMap(),
}));

/* --- Мокаем useFilterStore --- */
vi.mock('@/stores/useFilterStore', () => ({
  useFilterStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ selectedCity: 'Самара', discoveryMode: 'clubs' }),
}));

/* --- Мокаем useMapMarkers --- */
const mockUseMapMarkers = vi.fn().mockReturnValue([]);

vi.mock('@/components/map/useMapMarkers', () => ({
  useMapMarkers: (...args: unknown[]) => mockUseMapMarkers(...args),
}));

/* --- Мокаем ymaps3 глобально (используем function, не arrow — нужен new) --- */
type MarkerOptions = { coordinates: [number, number]; onClick?: () => void };
const mockSetLocation = vi.fn();
const mockAddChild = vi.fn();
const mockRemoveChild = vi.fn();
const mockYMapInstance = {
  addChild: mockAddChild,
  removeChild: mockRemoveChild,
  setLocation: mockSetLocation,
};
const MockYMap = vi.fn(function () {
  return mockYMapInstance;
});
const MockYMapDefaultSchemeLayer = vi.fn(function () {});
const MockYMapDefaultFeaturesLayer = vi.fn(function () {});
/** Созданные маркеры: параметры и DOM-узел — по ним проверяется вид и клик. */
const createdMarkers: Array<{ options: MarkerOptions; element: HTMLElement }> = [];
const MockYMapMarker = vi.fn(function (options: MarkerOptions, element: HTMLElement) {
  createdMarkers.push({ options, element });
  return { options, element };
});

(globalThis as Record<string, unknown>).ymaps3 = {
  ready: Promise.resolve(),
  YMap: MockYMap,
  YMapDefaultSchemeLayer: MockYMapDefaultSchemeLayer,
  YMapDefaultFeaturesLayer: MockYMapDefaultFeaturesLayer,
  YMapMarker: MockYMapMarker,
};

// Импорт после моков
const { MainMap } = await import('@/components/map/MainMap');

/* --- Дефолтные props --- */
const defaultProps = {
  clubs: [],
  trainers: [],
  sports: [
    { id: 1, name: 'Йога', color: '#8b5cf6' },
    { id: 2, name: 'Бокс' },
    { id: 3, name: 'Плавание', color: '#3b82f6' },
  ],
};

/** Два маркера: у «Йоги» цвет есть в справочнике, у «Бокса» нет. */
const twoMarkers = [
  {
    id: 1,
    slug: 'yoga-studio',
    name: 'Йога-студия',
    sportId: 1,
    sportName: 'Йога',
    sportColor: '#8b5cf6',
    address: 'ул. Мира, 5',
    rating: 4.8,
    priceFrom: 700,
    imageUrl: '/img/yoga.jpg',
    verifiedAt: '2026-09-01T00:00:00.000Z',
    coordinates: { lat: 53.2, lng: 50.1 },
    type: 'club' as const,
  },
  {
    id: 2,
    slug: 'box-club',
    name: 'Бокс Клуб',
    sportId: 2,
    sportName: 'Бокс',
    address: 'ул. Ленина, 2',
    rating: 0,
    priceFrom: 900,
    imageUrl: '',
    coordinates: { lat: 53.3, lng: 50.2 },
    type: 'club' as const,
  },
];

async function renderLoaded(markers: unknown[] = [], sports = defaultProps.sports) {
  mockUseYandexMap.mockReturnValue({ isLoaded: true, error: null });
  mockUseMapMarkers.mockReturnValue(markers);
  await act(async () => {
    render(<MainMap {...defaultProps} sports={sports} />);
  });
}

describe('MainMap (Step 19.6 + 19.7)', () => {
  beforeEach(() => {
    createdMarkers.length = 0;
    MockYMapMarker.mockClear();
    mockAddChild.mockClear();
    mockRemoveChild.mockClear();
  });

  it('показывает skeleton-loader пока API не загружен', () => {
    mockUseYandexMap.mockReturnValue({ isLoaded: false, error: null });

    render(<MainMap {...defaultProps} />);

    expect(screen.getByTestId('map-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('yandex-map-container')).not.toBeInTheDocument();
  });

  it('показывает сообщение об ошибке при error', () => {
    mockUseYandexMap.mockReturnValue({ isLoaded: false, error: 'Ошибка загрузки' });

    render(<MainMap {...defaultProps} />);

    expect(screen.getByText(/ошибка загрузки/i)).toBeInTheDocument();
  });

  it('рендерит контейнер карты после загрузки API', async () => {
    await renderLoaded();

    expect(screen.getByTestId('yandex-map-container')).toBeInTheDocument();
    expect(screen.queryByTestId('map-skeleton')).not.toBeInTheDocument();
  });

  it('инициализирует карту с DEFAULT_MAP_CENTER и DEFAULT_MAP_ZOOM', async () => {
    MockYMap.mockClear();
    await renderLoaded();

    expect(MockYMap).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({
        location: {
          center: [DEFAULT_MAP_CENTER.lng, DEFAULT_MAP_CENTER.lat],
          zoom: DEFAULT_MAP_ZOOM,
        },
      }),
    );
  });

  it('добавляет слои по умолчанию (scheme + features)', async () => {
    MockYMapDefaultSchemeLayer.mockClear();
    MockYMapDefaultFeaturesLayer.mockClear();
    await renderLoaded();

    expect(MockYMapDefaultSchemeLayer).toHaveBeenCalled();
    expect(MockYMapDefaultFeaturesLayer).toHaveBeenCalled();
    expect(mockAddChild).toHaveBeenCalledTimes(2);
  });

  it('показывает empty state когда маркеров нет', async () => {
    await renderLoaded([]);

    expect(screen.getByTestId('map-empty-state')).toBeInTheDocument();
    expect(screen.getByText(/пока нет доступных услуг/i)).toBeInTheDocument();
  });

  it('не показывает empty state когда маркеры есть', async () => {
    await renderLoaded(twoMarkers);

    expect(screen.queryByTestId('map-empty-state')).not.toBeInTheDocument();
  });
});

describe('MainMap (38.80): маркеры-капли, активное состояние, карточка снизу, легенда', () => {
  beforeEach(() => {
    createdMarkers.length = 0;
    MockYMapMarker.mockClear();
    mockAddChild.mockClear();
    mockRemoveChild.mockClear();
  });

  it('маркер — капля эталона DOM-узлами; цвет капли — из данных вида, без цвета атрибута нет', async () => {
    await renderLoaded(twoMarkers);

    expect(MockYMapMarker).toHaveBeenCalledTimes(2);
    const [yoga, box] = createdMarkers;
    expect(yoga.options.coordinates).toEqual([50.1, 53.2]);

    // Капля: обёртка с классом, внутри SVG с контуром капли и белым кругом — узлами, не строкой.
    expect(yoga.element.classList.contains('map-marker-pin')).toBe(true);
    expect(yoga.element.getAttribute('aria-label')).toBe('Йога-студия');
    const drop = yoga.element.querySelector('svg path.map-marker-drop');
    expect(drop).not.toBeNull();
    expect(drop?.getAttribute('d')).toContain('M16 0C7.163 0 0 7.163 0 16');
    expect(yoga.element.querySelector('svg circle')).not.toBeNull();

    // Цвет — атрибут из справочника вида; у вида без цвета атрибута нет (цвет даёт CSS-токен).
    expect(drop?.getAttribute('fill')).toBe('#8b5cf6');
    expect(box.element.querySelector('svg path.map-marker-drop')?.hasAttribute('fill')).toBe(false);
  });

  it('клик по маркеру — активное состояние капли и карточка снизу; «Закрыть» снимает выбор', async () => {
    await renderLoaded(twoMarkers);
    const [yoga, box] = createdMarkers;

    expect(screen.queryByRole('complementary', { name: 'Выбрано на карте' })).toBeNull();

    act(() => {
      yoga.options.onClick?.();
    });

    expect(yoga.element.classList.contains('is-active')).toBe(true);
    expect(box.element.classList.contains('is-active')).toBe(false);

    const card = screen.getByRole('complementary', { name: 'Выбрано на карте' });
    expect(within(card).getByRole('heading', { name: 'Йога-студия' })).toBeInTheDocument();
    expect(within(card).getByText('ул. Мира, 5')).toBeInTheDocument();
    expect(within(card).getByText('4.8')).toBeInTheDocument();
    expect(within(card).getByText(/от 700/)).toBeInTheDocument();
    expect(within(card).getByRole('img', { name: 'Йога-студия' })).toHaveAttribute(
      'src',
      '/img/yoga.jpg',
    );
    // Знак проверки — только у публикации с `verifiedAt`.
    expect(within(card).getByText('Клуб проверен')).toBeInTheDocument();
    // Путь к странице сохранён (реестр № 71): ссылка, а не переход по клику на всю карточку.
    const detail = within(card).getByRole('link', { name: 'Подробнее' });
    expect(detail).toHaveAttribute('href', '/clubs/yoga-studio');
    // Ссылка в виде primary-кнопки — классами `ui/Button`, не своей копией (ревью 38.80).
    expect(detail.className).toContain('shadow-glow');
    expect(detail.className).toContain('font-display');
    expect(detail.className).toContain('rounded-[9px]');

    // Второй маркер — выбор переезжает.
    act(() => {
      box.options.onClick?.();
    });
    expect(box.element.classList.contains('is-active')).toBe(true);
    expect(yoga.element.classList.contains('is-active')).toBe(false);
    const boxCard = screen.getByRole('complementary', { name: 'Выбрано на карте' });
    expect(within(boxCard).getByRole('heading', { name: 'Бокс Клуб' })).toBeInTheDocument();
    expect(within(boxCard).queryByText('Клуб проверен')).toBeNull();
    // Без рейтинга — числа нет; без картинки — заглушка, а не пустой `src`.
    expect(within(boxCard).queryByText('0.0')).toBeNull();
    expect(within(boxCard).queryByRole('img')).toBeNull();

    fireEvent.click(within(boxCard).getByRole('button', { name: 'Закрыть' }));
    expect(screen.queryByRole('complementary', { name: 'Выбрано на карте' })).toBeNull();
    expect(box.element.classList.contains('is-active')).toBe(false);
  });

  it('Escape закрывает карточку; повторный клик по активному маркеру снимает выбор', async () => {
    await renderLoaded(twoMarkers);
    const [yoga] = createdMarkers;

    act(() => {
      yoga.options.onClick?.();
    });
    expect(screen.getByRole('complementary', { name: 'Выбрано на карте' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('complementary', { name: 'Выбрано на карте' })).toBeNull();

    act(() => {
      yoga.options.onClick?.();
    });
    expect(yoga.element.classList.contains('is-active')).toBe(true);
    act(() => {
      yoga.options.onClick?.();
    });
    expect(yoga.element.classList.contains('is-active')).toBe(false);
    expect(screen.queryByRole('complementary', { name: 'Выбрано на карте' })).toBeNull();
  });

  it('легенда: виды, что есть на карте, с точкой цвета из данных; без маркеров легенды нет', async () => {
    await renderLoaded(twoMarkers);

    const legend = screen.getByRole('list', { name: 'Виды спорта' });
    const items = within(legend).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual(['Йога', 'Бокс']);
    // Точка — SVG-круг с цветом-атрибутом из справочника; без цвета — атрибута нет.
    expect(items[0].querySelector('circle')?.getAttribute('fill')).toBe('#8b5cf6');
    expect(items[1].querySelector('circle')?.hasAttribute('fill')).toBe(false);
  });

  it('без маркеров легенды нет', async () => {
    await renderLoaded([]);
    expect(screen.queryByRole('list', { name: 'Виды спорта' })).toBeNull();
  });

  // Ревью 38.80: пока ни у одного вида нет цвета (до миграции и на базе без сида),
  // легенда была бы N одинаковых точек с разными названиями — то есть врала бы.
  it('пока ни у одного вида на карте нет цвета — легенды нет', async () => {
    await renderLoaded(
      twoMarkers.map((marker) => ({ ...marker, sportColor: undefined })),
      defaultProps.sports.map(({ id, name }) => ({ id, name })),
    );
    expect(screen.queryByRole('list', { name: 'Виды спорта' })).toBeNull();
    expect(screen.queryByText('Виды спорта')).toBeNull();
  });

  it('обратная половина: в коде карты нет ни innerHTML, ни словаря цветов', async () => {
    const dir = path.join(WEB_ROOT, 'src', 'components', 'map');
    const files = ['MainMap.tsx', 'map-marker-element.ts', 'MapActiveCard.tsx', 'MapLegend.tsx'];
    for (const file of files) {
      const text = await readFile(path.join(dir, file), 'utf8');
      expect(text, file).not.toMatch(/innerHTML/);
      expect(text, file).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    }
  });
});
