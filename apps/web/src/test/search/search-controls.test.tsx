/**
 * Поиск и фильтры главной (шаг 38.77): чипы видов спорта, переключатель «Клубы /
 * Тренеры», селектор города и чипы-сбросы живут в сторе `useFilterStore` — вид
 * перекрашен по эталону, связь со стором прежняя. Тест подключения: единственный
 * адрес, который трогает блок, — `GET /api/cities` при монтировании; смена любого
 * фильтра НЕ ходит в сеть (отбор в памяти — долг Д-15, до страницы каталога).
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SearchBar } from '@/components/search/SearchBar';
import { SearchControlsPreview } from '@/components/search/SearchControlsPreview';
import { SportFilters } from '@/components/search/SportFilters';
import { useFilterStore } from '@/stores/useFilterStore';

const sports = [
  { id: 1, name: 'Йога', icon: '🧘' },
  { id: 2, name: 'Бокс', icon: '🥊' },
  { id: 3, name: 'Плавание', icon: '🏊' },
];

const cities = [
  { id: 1, name: 'Самара' },
  { id: 2, name: 'Казань' },
];

/** Ответ бэкенда конвертом `{ success, data }` — как отдаёт `/api/cities`. */
function okJson(data: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data }) });
}

/** Ждём микрозадачи: ответ `fetch` и `setState` списка городов. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('Search controls', () => {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const address = typeof input === 'string' ? input : String(input);
    if (address.startsWith('/api/cities')) return okJson(cities);
    return Promise.reject(new Error(`Неожиданный адрес: ${address}`));
  });

  beforeEach(() => {
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
    useFilterStore.setState({
      discoveryMode: 'clubs',
      searchQuery: '',
      selectedSportId: null,
      selectedCity: 'Самара',
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('SearchBar обновляет поисковый запрос в store', () => {
    render(<SearchBar />);

    const input = screen.getByPlaceholderText('Бокс, йога, бассейн...');

    fireEvent.change(input, {
      target: { value: 'бокс рядом' },
    });

    expect(useFilterStore.getState().searchQuery).toBe('бокс рядом');
    expect(screen.getByDisplayValue('бокс рядом')).toBeInTheDocument();
  });

  it('в SearchBar нет кнопок: «Рядом» без обработчика снята — геолокации у площадки нет (38.93, тупик № 6)', () => {
    render(<SearchBar />);

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText('Рядом')).toBeNull();
  });

  it('SportFilters: группа чипов «Все» + виды из базы; клик пишет sportId в store, «Все» — снимает', () => {
    render(<SportFilters sports={sports} />);

    const group = screen.getByRole('group', { name: 'Виды спорта' });
    const names = within(group)
      .getAllByRole('button')
      .map((chip) => chip.textContent?.trim());
    expect(names).toEqual(['Все', '🧘Йога', '🥊Бокс', '🏊Плавание']);

    fireEvent.click(screen.getByRole('button', { name: 'Йога' }));
    expect(useFilterStore.getState().selectedSportId).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Бокс' }));
    expect(useFilterStore.getState().selectedSportId).toBe(2);

    fireEvent.click(screen.getByRole('button', { name: 'Все' }));
    expect(useFilterStore.getState().selectedSportId).toBeNull();
  });

  it('SportFilters: активный чип — зелёная заливка и aria-pressed, остальные — на подложке холста', () => {
    useFilterStore.setState({ selectedSportId: 2 });
    render(<SportFilters sports={sports} />);

    const active = screen.getByRole('button', { name: 'Бокс' });
    expect(active).toHaveAttribute('aria-pressed', 'true');
    expect(active.className).toContain('bg-lime');
    expect(active.className).toContain('text-ink');

    const idle = screen.getByRole('button', { name: 'Йога' });
    expect(idle).toHaveAttribute('aria-pressed', 'false');
    expect(idle.className).toContain('bg-bg');
    expect(idle.className).toContain('rounded-[10px]');
    // Чипы эталона строчные (12px 700), не капслок.
    expect(idle.className).not.toContain('uppercase');
  });

  it('preview: club-mode по умолчанию, секция #discover, бейджи города и счёта — из store и входных данных', async () => {
    render(<SearchControlsPreview clubCount={6} sports={sports} trainerCount={12} />);
    await flush();

    const section = screen.getByRole('region', { name: 'Поиск и фильтры' });
    expect(section.id).toBe('discover');
    expect(
      within(section).getByRole('heading', { name: 'Поиск по клубам и направлениям' }),
    ).toBeInTheDocument();
    expect(within(section).getByText('3 направления')).toBeInTheDocument();
    expect(within(section).getByText('6 клубов в выдаче')).toBeInTheDocument();

    // Город в бейдже — тот же, что в селекторе; смена в селекторе меняет бейдж.
    const badges = within(section).getByRole('list', { name: 'Сводка поиска' });
    expect(within(badges).getByText('Самара')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Выбор города'), { target: { value: 'Казань' } });
    expect(within(badges).getByText('Казань')).toBeInTheDocument();
    expect(useFilterStore.getState().selectedCity).toBe('Казань');
  });

  it('preview: чипы-сбросы появляются при заданном запросе или виде и снимают ровно свой фильтр', async () => {
    render(<SearchControlsPreview clubCount={6} sports={sports} trainerCount={12} />);
    await flush();

    // Без фильтров сбрасывать нечего — чипов нет.
    expect(screen.queryByRole('button', { name: /Сбросить/ })).toBeNull();

    fireEvent.change(screen.getByPlaceholderText('Бокс, йога, бассейн...'), {
      target: { value: 'плавание' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Плавание' }));

    const resetQuery = screen.getByRole('button', { name: 'Сбросить запрос: плавание' });
    const resetSport = screen.getByRole('button', { name: 'Сбросить вид: Плавание' });
    expect(resetQuery.className).toContain('bg-lime-soft');

    fireEvent.click(resetQuery);
    expect(useFilterStore.getState().searchQuery).toBe('');
    // Вид спорта чип запроса не трогает.
    expect(useFilterStore.getState().selectedSportId).toBe(3);

    fireEvent.click(resetSport);
    expect(useFilterStore.getState().selectedSportId).toBeNull();
    expect(screen.queryByRole('button', { name: /Сбросить/ })).toBeNull();
  });

  it('переключатель «Клубы / Тренеры»: сегмент на подложке, активный — зелёный; trainer-mode меняет тексты поиска', async () => {
    render(<SearchControlsPreview clubCount={6} sports={sports} trainerCount={12} />);
    await flush();

    const switcher = screen.getByRole('group', { name: 'Что искать' });
    const clubs = within(switcher).getByRole('button', { name: 'Клубы' });
    const trainers = within(switcher).getByRole('button', { name: 'Тренеры' });
    expect(clubs).toHaveAttribute('aria-pressed', 'true');
    expect(clubs.className).toContain('bg-lime');
    expect(trainers).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(trainers);

    expect(useFilterStore.getState().discoveryMode).toBe('trainers');
    expect(trainers).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('heading', { name: 'Поиск по тренерам и направлениям' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Поиск тренеров и направлений')).toBeInTheDocument();
    expect(screen.getByText('12 тренеров в выдаче')).toBeInTheDocument();
  });

  it('подключение: единственный адрес блока — GET /api/cities при монтировании; смена фильтров в сеть не ходит', async () => {
    render(<SearchControlsPreview clubCount={6} sports={sports} trainerCount={12} />);
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/cities');

    fireEvent.click(screen.getByRole('button', { name: 'Йога' }));
    fireEvent.change(screen.getByPlaceholderText('Бокс, йога, бассейн...'), {
      target: { value: 'зал' },
    });
    fireEvent.change(screen.getByLabelText('Выбор города'), { target: { value: 'Казань' } });
    fireEvent.click(screen.getByRole('button', { name: 'Тренеры' }));
    await flush();

    expect(useFilterStore.getState()).toMatchObject({
      discoveryMode: 'trainers',
      searchQuery: 'зал',
      selectedSportId: 1,
      selectedCity: 'Казань',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
