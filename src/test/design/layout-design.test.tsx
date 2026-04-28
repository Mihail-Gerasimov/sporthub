/**
 * Контракт дизайна layout-компонентов — проверяет,
 * что Header и Footer следуют минималистичному стилю.
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Мокаем next/navigation (Header использует useRouter)
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';

describe('Минималистичный стиль layout-компонентов', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
    useUIStore.setState({ isAuthModalOpen: false });
  });

  describe('Header', () => {
    it('лого-иконка не содержит shadow-floating (минимализм)', () => {
      render(<Header />);
      // Лого-иконка — элемент с текстом "S" внутри header
      const header = screen.getByRole('banner');
      const logoIcon = header.querySelector('span.flex.items-center.justify-center');
      expect(logoIcon).not.toBeNull();
      expect(logoIcon!.className).not.toContain('shadow-floating');
    });

    // Phase 28: новый дизайн SportHub использует Oswald 700 letter-spacing 0.18em
    // для eyebrow «SPORTHUB» (точное значение из UI Kit). Раньше (светлая палитра)
    // действовало правило «минимализм tracking ≤ 0.15em». Поднимаем предел до 0.20em.
    it('tracking подзаголовка "SportHub" не превышает 0.20em (UI Kit eyebrow)', () => {
      render(<Header />);
      const sportHubLabel = screen.getByText('SportHub');
      const trackingMatch = sportHubLabel.className.match(/tracking-\[([0-9.]+)em\]/);
      expect(trackingMatch).not.toBeNull();
      expect(parseFloat(trackingMatch![1])).toBeLessThanOrEqual(0.2);
    });
  });

  describe('Footer', () => {
    it('tracking заголовка "SportHub" не превышает 0.15em', () => {
      render(<Footer />);
      const footerLabels = screen.getAllByText('SportHub');
      // Footer содержит "SportHub" как label
      const footerLabel = footerLabels[0];
      const trackingMatch = footerLabel.className.match(/tracking-\[([0-9.]+)em\]/);
      expect(trackingMatch).not.toBeNull();
      expect(parseFloat(trackingMatch![1])).toBeLessThanOrEqual(0.15);
    });

    it('описание проекта использует leading-relaxed вместо leading-7', () => {
      render(<Footer />);
      const description = screen.getByText(/MVP с фокусом/);
      expect(description.className).toContain('leading-relaxed');
      expect(description.className).not.toContain('leading-7');
    });
  });
});
