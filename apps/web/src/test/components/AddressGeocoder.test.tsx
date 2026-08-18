/**
 * Тесты компонента AddressGeocoder — автокомплит адреса через Yandex Geosuggest.
 * Phase 23 — Step 23.5.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AddressGeocoder } from '@/components/profile/AddressGeocoder';

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AddressGeocoder', () => {
  it('рендерит поле адреса и кнопку «Проверить адрес»', () => {
    render(
      <AddressGeocoder
        city="Самара"
        address=""
        onAddressChange={vi.fn()}
        onCoordinatesChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Адрес')).toBeInTheDocument();
    expect(screen.getByText('Проверить адрес')).toBeInTheDocument();
  });

  it('кнопка «Проверить адрес» disabled при пустом городе/адресе', () => {
    render(
      <AddressGeocoder
        city=""
        address=""
        onAddressChange={vi.fn()}
        onCoordinatesChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Проверить адрес' })).toBeDisabled();
  });

  it('показывает ошибку валидации', () => {
    render(
      <AddressGeocoder
        city="Самара"
        address=""
        onAddressChange={vi.fn()}
        onCoordinatesChange={vi.fn()}
        addressError="Адрес обязателен"
      />,
    );

    expect(screen.getByText('Адрес обязателен')).toBeInTheDocument();
  });

  it('кнопка «Проверить адрес» вызывает geocode', async () => {
    const onCoordinatesChange = vi.fn();

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            coordinates: { lat: 53.2, lng: 50.15 },
            formattedAddress: 'Самара, ул. Ленина, 15',
          },
        }),
    } as Response);

    render(
      <AddressGeocoder
        city="Самара"
        address="ул. Ленина, 15"
        onAddressChange={vi.fn()}
        onCoordinatesChange={onCoordinatesChange}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Проверить адрес'));
    });

    expect(onCoordinatesChange).toHaveBeenCalledWith({ lat: 53.2, lng: 50.15 });
    expect(screen.getByText(/Адрес найден/)).toBeInTheDocument();
  });

  it('показывает ошибку при неудачном geocode', async () => {
    const onCoordinatesChange = vi.fn();

    fetchSpy.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ success: false, error: 'Адрес не найден' }),
    } as Response);

    render(
      <AddressGeocoder
        city="Самара"
        address="несуществующий адрес"
        onAddressChange={vi.fn()}
        onCoordinatesChange={onCoordinatesChange}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Проверить адрес'));
    });

    expect(onCoordinatesChange).toHaveBeenCalledWith(undefined);
    expect(screen.getByText('Адрес не найден')).toBeInTheDocument();
  });

  it('сбрасывает geocode при изменении адреса', async () => {
    const onCoordinatesChange = vi.fn();
    const onAddressChange = vi.fn();

    // Сначала успешный geocode
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            coordinates: { lat: 53.2, lng: 50.15 },
            formattedAddress: 'Самара, ул. Ленина, 15',
          },
        }),
    } as Response);

    render(
      <AddressGeocoder
        city="Самара"
        address="ул. Ленина, 15"
        onAddressChange={onAddressChange}
        onCoordinatesChange={onCoordinatesChange}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Проверить адрес'));
    });

    expect(screen.getByText(/Адрес найден/)).toBeInTheDocument();

    // Меняем адрес — geocode сбрасывается
    fireEvent.change(screen.getByLabelText('Адрес'), { target: { value: 'ул. Пушкина' } });

    expect(screen.queryByText(/Адрес найден/)).not.toBeInTheDocument();
    expect(onCoordinatesChange).toHaveBeenLastCalledWith(undefined);
  });
});
