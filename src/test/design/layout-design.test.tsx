/**
 * Контракт дизайна layout-компонентов — проверяет,
 * что Header и Footer следуют минималистичному стилю.
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

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

    it('tracking подзаголовка "SportHub" не превышает 0.15em', () => {
      render(<Header />);
      const sportHubLabel = screen.getByText('SportHub');
      const trackingMatch = sportHubLabel.className.match(/tracking-\[([0-9.]+)em\]/);
      expect(trackingMatch).not.toBeNull();
      expect(parseFloat(trackingMatch![1])).toBeLessThanOrEqual(0.15);
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
