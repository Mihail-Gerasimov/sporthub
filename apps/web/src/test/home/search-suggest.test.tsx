// Тесты выпадашки подсказок поиска (шаг 38.68).
//
// Три вещи, которых у макета не было и которые здесь закреплены: популярные виды
// приходят с бэкенда (тест подключения — какой адрес дёргается, с числом, а не
// «параметр присутствует»), выбор вида идёт тем же путём, что чипы, и НЕ затирает
// введённый текст (реестр № 63), клавиатура — стрелки, Enter, Escape по ролям
// `listbox`/`option` (эталон step-85: у макета Enter не срабатывал).

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SearchSuggest } from '@/components/home/SearchSuggest';
import { useFilterStore } from '@/stores/useFilterStore';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

const SPORTS = [
  { id: 1, name: 'Йога', icon: '🧘' },
  { id: 2, name: 'Бокс', icon: '🥊' },
  { id: 3, name: 'Плавание', icon: '🏊' },
];

const POPULAR = [
  { id: 3, name: 'Плавание', icon: '🏊', publicationCount: 7 },
  { id: 2, name: 'Бокс', icon: '🥊', publicationCount: 4 },
];

/** Обвязка: поле поиска снаружи, как в виджете героя, выпадашка открыта по фокусу. */
function Harness({ initiallyOpen = true }: { initiallyOpen?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(initiallyOpen);

  return (
    <div>
      <input ref={inputRef} aria-label="Поиск" onFocus={() => setOpen(true)} />
      <SearchSuggest
        open={open}
        sports={SPORTS}
        inputRef={inputRef}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}

const flush = () => act(async () => {});

describe('SearchSuggest', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    push.mockReset();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: POPULAR }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    useFilterStore.setState({ discoveryMode: 'clubs', searchQuery: '', selectedSportId: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('подключение: популярные виды спрашиваются у /api/sports?popular=N с ЧИСЛОМ', async () => {
    render(<Harness />);
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const url = new URL(String(fetchMock.mock.calls[0][0]), 'http://localhost');

    expect(url.pathname).toBe('/api/sports');
    expect(Number(url.searchParams.get('popular'))).toBeGreaterThan(0);
    expect(url.search).not.toContain('undefined');
  });

  it('закрытая выпадашка запросов не шлёт; открытая спрашивает один раз', async () => {
    render(<Harness initiallyOpen={false} />);
    await flush();

    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.focus(screen.getByLabelText('Поиск'));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('две рубрики из словаря; категории — из справочника, популярные — из ответа с числом', async () => {
    render(<Harness />);
    await flush();

    const list = screen.getByRole('listbox', { name: 'Подсказки поиска' });

    expect(within(list).getByText('Категории')).toBeInTheDocument();
    expect(within(list).getByText('Популярные виды')).toBeInTheDocument();

    const groups = within(list).getAllByRole('group');

    expect(
      within(groups[0])
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['🧘Йога', '🥊Бокс', '🏊Плавание']);
    expect(
      within(groups[1])
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['🏊Плавание7', '🥊Бокс4']);
  });

  it('клик по виду применяет фильтр в сторе тем же путём, что чипы, и ведёт к #results', async () => {
    render(<Harness />);
    await flush();

    const [categories] = within(screen.getByRole('listbox')).getAllByRole('group');

    fireEvent.click(within(categories).getByRole('option', { name: /бокс/i }));

    expect(useFilterStore.getState().selectedSportId).toBe(2);
    expect(push).toHaveBeenCalledWith('/#results');
    // Выпадашка закрылась.
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('введённый текст НЕ теряется при выборе вида (реестр № 63)', async () => {
    useFilterStore.setState({ searchQuery: 'утренняя' });
    render(<Harness />);
    await flush();

    // Из популярных — тот же путь, что и из категорий.
    const [, popularGroup] = within(screen.getByRole('listbox')).getAllByRole('group');

    fireEvent.click(within(popularGroup).getByRole('option', { name: /плавание/i }));

    expect(useFilterStore.getState().searchQuery).toBe('утренняя');
    expect(useFilterStore.getState().selectedSportId).toBe(3);

    fireEvent.focus(screen.getByLabelText('Поиск'));
    await flush();
    fireEvent.click(screen.getByRole('option', { name: /йога/i }));

    expect(useFilterStore.getState().searchQuery).toBe('утренняя');
    expect(useFilterStore.getState().selectedSportId).toBe(1);
  });

  it('клавиатура: ↓ из поля — в первый пункт, стрелки по кругу, Home/End, Enter выбирает', async () => {
    render(<Harness />);
    await flush();

    const input = screen.getByLabelText('Поиск');

    input.focus();
    fireEvent.keyDown(input, { key: 'ArrowDown' });

    const options = screen.getAllByRole('option');

    expect(document.activeElement).toBe(options[0]);

    fireEvent.keyDown(options[0], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(options[1]);

    fireEvent.keyDown(options[1], { key: 'ArrowUp' });
    fireEvent.keyDown(options[0], { key: 'ArrowUp' });
    expect(document.activeElement, 'стрелка вверх с первого идёт по кругу к последнему').toBe(
      options[options.length - 1],
    );

    fireEvent.keyDown(options[options.length - 1], { key: 'Home' });
    expect(document.activeElement, 'Home — в первый пункт').toBe(options[0]);

    fireEvent.keyDown(options[0], { key: 'End' });
    expect(document.activeElement, 'End — в последний пункт').toBe(options[options.length - 1]);

    // Enter на пункте — выбор: последний пункт — популярный «Бокс».
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Enter' });
    expect(useFilterStore.getState().selectedSportId).toBe(2);
    expect(push).toHaveBeenCalledWith('/#results');
  });

  it('Escape из списка закрывает выпадашку и возвращает фокус в поле — не открывая заново', async () => {
    render(<Harness />);
    await flush();

    const input = screen.getByLabelText('Поиск');
    input.focus();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' });

    // Обвязка открывает выпадашку по фокусу поля, как виджет героя: возврат фокуса
    // не должен открыть её обратно (иначе `Escape` бесполезен).
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(input);
  });

  it('Escape в самом поле закрывает выпадашку', async () => {
    render(<Harness />);
    await flush();

    const input = screen.getByLabelText('Поиск');
    input.focus();
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(input);
  });

  it('выбранный вид отмечен aria-selected, рубрика категорий следует режиму поиска', async () => {
    useFilterStore.setState({ discoveryMode: 'trainers', selectedSportId: 3 });
    render(<Harness />);
    await flush();

    expect(screen.getByText('Специализации')).toBeInTheDocument();
    const selected = screen.getAllByRole('option', { selected: true });
    expect(selected.map((o) => o.textContent)).toEqual(['🏊Плавание', '🏊Плавание7']);
  });

  it('сбой ответа не роняет выпадашку: категории остаются, популярных нет', async () => {
    fetchMock.mockRejectedValue(new Error('сеть'));
    render(<Harness />);
    await flush();

    const groups = within(screen.getByRole('listbox')).getAllByRole('group');

    expect(within(groups[0]).getAllByRole('option')).toHaveLength(3);
    expect(within(groups[1]).queryAllByRole('option')).toHaveLength(0);
  });
});
