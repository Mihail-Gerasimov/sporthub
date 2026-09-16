// Тесты поискового виджета героя `HeroSearch` (фаза 38, шаг 38.67).
//
// Виджет — по эталону (`HomePage.tsx:310-352`): переключатель «Клубы / Тренеры»,
// поле с иконкой, кнопка «Найти». Логика наша: живой отбор при вводе остаётся
// (стор фильтров тот же, что у рабочей части), кнопка и Enter дают цели —
// ведут к выдаче `#results`, не теряя введённого (реестр № 62; в дизайне текст
// подменялся подписью категории). Выпадашка подсказок (38.68) открывается по фокусу.

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

import { HeroSearch } from '@/components/home/HeroSearch';
import { SEARCH } from '@/lib/home-copy';
import { homeSectionHref } from '@/lib/home-sections';
import { useFilterStore } from '@/stores/useFilterStore';

const sports = [
  { id: 1, name: 'Йога', icon: '🧘' },
  { id: 3, name: 'Плавание', icon: '🏊' },
];

describe('HeroSearch', () => {
  beforeEach(() => {
    push.mockClear();
    useFilterStore.setState({ discoveryMode: 'clubs', searchQuery: '', selectedSportId: null });
    // Популярные виды выпадашки — пустой ответ: здесь не её предмет.
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true, data: [] }) }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('переключатель меняет режим поиска в общем сторе, подписи и подсказка поля — по режиму', () => {
    render(<HeroSearch sports={sports} />);

    const clubs = screen.getByRole('button', { name: SEARCH.modes.clubs, pressed: true });
    const trainers = screen.getByRole('button', { name: SEARCH.modes.trainers, pressed: false });

    expect(clubs).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: SEARCH.inputLabel.clubs })).toHaveAttribute(
      'placeholder',
      SEARCH.placeholder.clubs,
    );

    fireEvent.click(trainers);

    expect(useFilterStore.getState().discoveryMode).toBe('trainers');
    expect(
      screen.getByRole('button', { name: SEARCH.modes.trainers, pressed: true }),
    ).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: SEARCH.inputLabel.trainers })).toHaveAttribute(
      'placeholder',
      SEARCH.placeholder.trainers,
    );
  });

  it('ввод фильтрует живьём — запрос уходит в стор с каждой буквой', () => {
    render(<HeroSearch sports={sports} />);

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'йога' } });

    expect(useFilterStore.getState().searchQuery).toBe('йога');
  });

  it('«Найти» ведёт к выдаче, не теряя введённого', () => {
    render(<HeroSearch sports={sports} />);

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'бассейн' } });
    fireEvent.click(screen.getByRole('button', { name: SEARCH.button }));

    expect(push).toHaveBeenCalledWith(homeSectionHref('results'));
    // ⚠️ В дизайне запрос терялся: строка подменялась подписью категории.
    expect(useFilterStore.getState().searchQuery).toBe('бассейн');
  });

  it('Enter в поле — та же цель, что у кнопки', () => {
    render(<HeroSearch sports={sports} />);

    const input = screen.getByRole('searchbox');

    fireEvent.change(input, { target: { value: 'бокс' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(push).toHaveBeenCalledWith(homeSectionHref('results'));
  });

  it('выпадашка подсказок открывается по фокусу в поле и закрывается по Escape', async () => {
    render(<HeroSearch sports={sports} />);

    const input = screen.getByRole('searchbox');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    await act(async () => {
      input.focus();
    });

    expect(screen.getByRole('listbox')).toBeInTheDocument();
    // Категории — из справочника, переданного пропсом, а не из списка в компоненте.
    expect(screen.getByRole('option', { name: /Йога/ })).toBeInTheDocument();

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Escape' });
    });

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
