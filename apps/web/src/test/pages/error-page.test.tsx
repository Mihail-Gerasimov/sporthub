/**
 * Граница ошибки страниц и «не найдено» (фаза 38, шаг 38.83 — «Загрузка и ошибка»).
 *
 * Слова — те же, что с фазы 33: сбой бэкенда доходит до человека как «сервис
 * недоступен», а не как пустой каталог. Проверяется поведение, не вид: заголовок,
 * объяснение «это сбой, а не пусто», «Попробовать снова» зовёт `reset`, отпечаток
 * запроса виден, когда он есть; 404 ведёт на главную. Вид — сторожа дизайна
 * (`no-raw-colors`, `tokens-contract`) и `ui/Button`.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ErrorPage from '@/app/error';
import NotFound from '@/app/not-found';

describe('app/error.tsx — сбой доходит до человека честно', () => {
  beforeEach(() => {
    // Граница пишет сбой в консоль — в тесте это шум, а не проверка.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('говорит «сервис недоступен», что это сбой, а не пустой каталог, и даёт повторить', () => {
    const reset = vi.fn();
    const error = Object.assign(new Error('ECONNREFUSED'), { digest: 'a1b2c3' });

    render(<ErrorPage error={error} reset={reset} />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Сервис временно недоступен' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/не пустой каталог/)).toBeInTheDocument();
    expect(screen.getByText('Код обращения: a1b2c3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Попробовать снова' }));

    expect(reset).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('страница'), error);
  });

  it('без отпечатка строки «Код обращения» нет', () => {
    render(<ErrorPage error={new Error('boom')} reset={() => undefined} />);

    expect(screen.queryByText(/Код обращения/)).not.toBeInTheDocument();
  });
});

describe('app/not-found.tsx', () => {
  it('называет ошибку и ведёт на главную', () => {
    render(<NotFound />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Такой страницы нет' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'На главную' })).toHaveAttribute('href', '/');
  });
});
