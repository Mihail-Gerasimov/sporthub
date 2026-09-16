/**
 * Меню шапки на узких экранах (шаг 38.58): открывается кнопкой, показывает те же
 * пункты, что и широкая навигация, закрывается Escape, кликом по оверлею и по пункту;
 * фокус после закрытия возвращается на кнопку.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { HeaderMenu } from '@/components/layout/HeaderMenu';
import { HEADER_NAV } from '@/lib/navigation';
import { useUIStore } from '@/stores/useUIStore';

/** Оверлей — единственный скрытый от диктора слой с затемнением; testid ему не нужен. */
function overlayOf(container: HTMLElement): HTMLElement {
  const overlay = container.querySelector<HTMLElement>('[aria-hidden="true"][class*="bg-ink/35"]');
  if (!overlay) throw new Error('оверлей меню не найден');
  return overlay;
}

describe('HeaderMenu', () => {
  beforeEach(() => {
    useUIStore.setState({ isHeaderMenuOpen: false });
  });

  it('закрыто по умолчанию; кнопка открывает панель с пунктами из словаря', () => {
    render(<HeaderMenu />);
    const button = screen.getByRole('button', { name: 'Открыть меню' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('navigation', { name: 'Меню' })).not.toBeInTheDocument();

    fireEvent.click(button);

    const panel = screen.getByRole('navigation', { name: 'Меню' });
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button).toHaveAttribute('aria-controls', panel.id);
    const links = screen.getAllByRole('link');
    expect(links.map((a) => a.textContent)).toEqual(HEADER_NAV.map((i) => i.label));
    expect(links.map((a) => a.getAttribute('href'))).toEqual(HEADER_NAV.map((i) => i.href));
    // Первый пункт получил фокус.
    expect(links[0]).toHaveFocus();
  });

  it('Escape закрывает панель и возвращает фокус на кнопку', () => {
    render(<HeaderMenu />);
    const button = screen.getByRole('button', { name: 'Открыть меню' });
    fireEvent.click(button);
    expect(screen.getByRole('navigation', { name: 'Меню' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('navigation', { name: 'Меню' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Открыть меню' })).toHaveFocus();
  });

  it('клик по оверлею и по пункту закрывает панель', () => {
    const { container } = render(<HeaderMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'Открыть меню' }));
    fireEvent.click(overlayOf(container));
    expect(screen.queryByRole('navigation', { name: 'Меню' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Открыть меню' }));
    fireEvent.click(screen.getAllByRole('link')[0]);
    expect(screen.queryByRole('navigation', { name: 'Меню' })).not.toBeInTheDocument();
  });

  it('оверлей — без роли и скрыт от экранного диктора, панель — под шапкой', () => {
    const { container } = render(<HeaderMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'Открыть меню' }));
    const overlay = overlayOf(container);
    expect(overlay).toHaveAttribute('aria-hidden', 'true');
    // Панель считает от шапки (`top-full`), а не от окна: над шапкой может стоять плашка подмены.
    expect(screen.getByRole('navigation', { name: 'Меню' }).className).toContain('top-full');
    expect(screen.getByRole('navigation', { name: 'Меню' }).className).not.toMatch(/\bfixed\b/);
  });

  it('фокус заперт: Tab с последнего пункта — на кнопку, Shift+Tab с кнопки — на последний пункт', () => {
    render(<HeaderMenu />);
    const button = screen.getByRole('button', { name: 'Открыть меню' });
    fireEvent.click(button);
    const links = screen.getAllByRole('link');
    const last = links[links.length - 1];

    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Закрыть меню' })).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });

  it('состояние «открыто» видно снаружи через UI-стор — док читает его', () => {
    render(<HeaderMenu />);
    expect(useUIStore.getState().isHeaderMenuOpen).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Открыть меню' }));
    expect(useUIStore.getState().isHeaderMenuOpen).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(useUIStore.getState().isHeaderMenuOpen).toBe(false);
  });
});
