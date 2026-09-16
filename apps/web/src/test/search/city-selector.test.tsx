/**
 * Селектор города (шаг 38.78): список городов приходит из `GET /api/cities`
 * один раз при монтировании, выбор пишется в `useFilterStore.selectedCity`
 * (формат — заглавная буква, как хранит стор). Текущий город виден в поле всегда —
 * и пока список не приехал, и если сеть отказала: иначе поле стоит пустым, а
 * каталог при этом отобран по городу, которого на экране нет.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CitySelector } from '@/components/search/CitySelector';
import { useFilterStore } from '@/stores/useFilterStore';

const cities = [
  { id: 1, name: 'Самара' },
  { id: 2, name: 'Казань' },
  { id: 3, name: 'Тольятти' },
];

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function respond(data: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data }) });
}

describe('CitySelector', () => {
  beforeEach(() => {
    useFilterStore.setState({ selectedCity: 'Самара' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('подключение: города спрашиваются у GET /api/cities ровно один раз; смена города в сеть не ходит', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL) => ReturnType<typeof respond>>(() =>
      respond(cities),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<CitySelector />);
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/cities');

    const select = screen.getByLabelText('Выбор города');
    expect([...select.querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      'Самара',
      'Казань',
      'Тольятти',
    ]);

    fireEvent.change(select, { target: { value: 'Тольятти' } });
    expect(useFilterStore.getState().selectedCity).toBe('Тольятти');
    expect(screen.getByDisplayValue('Тольятти')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('текущий город виден в поле до ответа сети и при её отказе', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('сеть недоступна'))),
    );

    render(<CitySelector />);
    // До ответа: единственный пункт — текущий город стора.
    expect(screen.getByDisplayValue('Самара')).toBeInTheDocument();

    await flush();
    // После отказа: поле не опустело.
    expect(screen.getByDisplayValue('Самара')).toBeInTheDocument();
    expect(useFilterStore.getState().selectedCity).toBe('Самара');
  });

  it('вид эталона: подпись «Город» над полем на подложке холста, без собственной рамки у select', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => respond(cities)),
    );

    render(<CitySelector />);
    await flush();

    const select = screen.getByLabelText('Выбор города');
    expect(select.className).toContain('appearance-none');
    expect(select.className).toContain('bg-transparent');
    const field = select.closest('label');
    expect(field).not.toBeNull();
    expect(field?.className).toContain('bg-bg');
    expect(field?.className).toContain('border-line');
    expect(field?.textContent).toContain('Город');
  });
});
