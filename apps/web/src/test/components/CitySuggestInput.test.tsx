/**
 * Тесты компонента CitySuggestInput — автокомплит города через Yandex Geosuggest.
 * Phase 23 — Step 23.3.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CitySuggestInput } from '@/components/profile/CitySuggestInput';

let fetchSpy: ReturnType<typeof vi.spyOn>;

function makeApiResponse(
  suggestions: Array<{ title: string; subtitle?: string; value: string; type: string }>,
) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        success: true,
        data: { suggestions },
      }),
  };
}

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch');
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('CitySuggestInput', () => {
  it('рендерит поле с лейблом «Город»', () => {
    render(<CitySuggestInput value="Самара" onChange={vi.fn()} />);

    expect(screen.getByLabelText('Город')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Самара')).toBeInTheDocument();
  });

  it('рендерит кастомный лейбл', () => {
    render(<CitySuggestInput value="" onChange={vi.fn()} label="Населённый пункт" />);

    expect(screen.getByLabelText('Населённый пункт')).toBeInTheDocument();
  });

  it('показывает ошибку валидации', () => {
    render(<CitySuggestInput value="" onChange={vi.fn()} error="Город обязателен" />);

    expect(screen.getByText('Город обязателен')).toBeInTheDocument();
  });

  it('вызывает onChange при blur с введённым текстом', async () => {
    const onChange = vi.fn();

    render(<CitySuggestInput value="" onChange={onChange} />);

    const input = screen.getByLabelText('Город');
    fireEvent.change(input, { target: { value: 'Новосибирск' } });
    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalledWith('Новосибирск', undefined);
  });

  it('показывает dropdown подсказок при вводе', async () => {
    // Мокаем suggest API
    fetchSpy.mockResolvedValueOnce(
      makeApiResponse([
        { title: 'Самара', subtitle: 'Россия', value: 'Самара, Россия', type: 'locality' },
        { title: 'Саратов', subtitle: 'Россия', value: 'Саратов, Россия', type: 'locality' },
      ]) as Response,
    );

    render(<CitySuggestInput value="" onChange={vi.fn()} />);

    const input = screen.getByLabelText('Город');
    fireEvent.change(input, { target: { value: 'Сам' } });

    // Ждём debounce (act нужен для flush React state updates из useSuggest)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    // Dropdown должен появиться
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByText('Самара')).toBeInTheDocument();
    expect(screen.getByText('Саратов')).toBeInTheDocument();
  });

  it('вызывает onChange при выборе подсказки', async () => {
    const onChange = vi.fn();

    // Мок suggest API
    fetchSpy.mockResolvedValueOnce(
      makeApiResponse([
        { title: 'Самара', subtitle: 'Россия', value: 'Самара, Россия', type: 'locality' },
      ]) as Response,
    );
    // Мок geocode для координат
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: { coordinates: { lat: 53.195878, lng: 50.100202 }, formattedAddress: 'Самара' },
        }),
    } as Response);

    render(<CitySuggestInput value="" onChange={onChange} />);

    const input = screen.getByLabelText('Город');
    fireEvent.change(input, { target: { value: 'Сам' } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    // Кликаем на подсказку
    const option = screen.getByText('Самара');
    fireEvent.click(option);

    // onChange вызван с названием города
    expect(onChange).toHaveBeenCalledWith('Самара', undefined);
  });

  it('не показывает dropdown при пустом тексте', () => {
    render(<CitySuggestInput value="" onChange={vi.fn()} />);

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
