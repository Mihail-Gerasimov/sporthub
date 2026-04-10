// Тесты MainMap (Step 19.6 + 19.7)
// Покрывают: skeleton, error, рендер карты, инициализация, empty state маркеров
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from '@/lib/constants';

/* --- Мокаем useYandexMap — управляем isLoaded из тестов --- */
const mockUseYandexMap = vi.fn();

vi.mock('@/components/map/YandexMapProvider', () => ({
  useYandexMap: () => mockUseYandexMap(),
}));

/* --- Мокаем useFilterStore --- */
vi.mock('@/stores/useFilterStore', () => ({
  useFilterStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ selectedCity: 'Самара' }),
}));

/* --- Мокаем useMapMarkers --- */
const mockUseMapMarkers = vi.fn().mockReturnValue([]);

vi.mock('@/components/map/useMapMarkers', () => ({
  useMapMarkers: (...args: unknown[]) => mockUseMapMarkers(...args),
}));

/* --- Мокаем ymaps3 глобально (используем function, не arrow — нужен new) --- */
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

(globalThis as Record<string, unknown>).ymaps3 = {
  YMap: MockYMap,
  YMapDefaultSchemeLayer: MockYMapDefaultSchemeLayer,
  YMapDefaultFeaturesLayer: MockYMapDefaultFeaturesLayer,
};

// Импорт после моков
const { MainMap } = await import('@/components/map/MainMap');

/* --- Дефолтные props --- */
const defaultProps = {
  clubs: [],
  trainers: [],
  sports: [],
};

describe('MainMap (Step 19.6 + 19.7)', () => {
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

  it('рендерит контейнер карты после загрузки API', () => {
    mockUseYandexMap.mockReturnValue({ isLoaded: true, error: null });

    render(<MainMap {...defaultProps} />);

    expect(screen.getByTestId('yandex-map-container')).toBeInTheDocument();
    expect(screen.queryByTestId('map-skeleton')).not.toBeInTheDocument();
  });

  it('инициализирует карту с DEFAULT_MAP_CENTER и DEFAULT_MAP_ZOOM', () => {
    mockUseYandexMap.mockReturnValue({ isLoaded: true, error: null });
    MockYMap.mockClear();

    render(<MainMap {...defaultProps} />);

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

  it('добавляет слои по умолчанию (scheme + features)', () => {
    mockUseYandexMap.mockReturnValue({ isLoaded: true, error: null });
    mockAddChild.mockClear();
    MockYMapDefaultSchemeLayer.mockClear();
    MockYMapDefaultFeaturesLayer.mockClear();

    render(<MainMap {...defaultProps} />);

    expect(MockYMapDefaultSchemeLayer).toHaveBeenCalled();
    expect(MockYMapDefaultFeaturesLayer).toHaveBeenCalled();
    expect(mockAddChild).toHaveBeenCalledTimes(2);
  });

  it('показывает empty state когда маркеров нет', () => {
    mockUseYandexMap.mockReturnValue({ isLoaded: true, error: null });
    mockUseMapMarkers.mockReturnValue([]);

    render(<MainMap {...defaultProps} />);

    expect(screen.getByTestId('map-empty-state')).toBeInTheDocument();
    expect(screen.getByText(/пока нет доступных услуг/i)).toBeInTheDocument();
  });

  it('не показывает empty state когда маркеры есть', () => {
    mockUseYandexMap.mockReturnValue({ isLoaded: true, error: null });
    mockUseMapMarkers.mockReturnValue([
      {
        id: 1,
        slug: 'test',
        name: 'Test',
        sportName: 'Йога',
        address: 'ул. Мира',
        rating: 4.5,
        coordinates: { lat: 53, lng: 50 },
        type: 'club',
      },
    ]);

    render(<MainMap {...defaultProps} />);

    expect(screen.queryByTestId('map-empty-state')).not.toBeInTheDocument();
  });
});
