/**
 * Контракт дизайна базовых UI-компонентов — проверяет,
 * что компоненты следуют минималистичному стилю.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';

describe('Минималистичный стиль UI-компонентов', () => {
  describe('Button', () => {
    it('primary-кнопка не содержит shadow-floating (минимализм)', () => {
      render(<Button variant="primary">Записаться</Button>);
      const button = screen.getByRole('button');
      expect(button.className).not.toContain('shadow-floating');
    });

    it('secondary-кнопка не содержит shadow-card (минимализм)', () => {
      render(<Button variant="secondary">Подробнее</Button>);
      const button = screen.getByRole('button');
      expect(button.className).not.toContain('shadow-card');
    });
  });

  describe('Badge', () => {
    it('tracking не превышает 0.10em (сдержанная типографика)', () => {
      render(<Badge>Тест</Badge>);
      const badge = screen.getByText('Тест');
      // Извлекаем tracking значение из className
      const trackingMatch = badge.className.match(/tracking-\[([0-9.]+)em\]/);
      expect(trackingMatch).not.toBeNull();
      const trackingValue = parseFloat(trackingMatch![1]);
      expect(trackingValue).toBeLessThanOrEqual(0.1);
    });
  });

  describe('Chip', () => {
    it('active-чип не содержит shadow-card (минимализм)', () => {
      render(<Chip active>Фильтр</Chip>);
      const chip = screen.getByRole('button');
      expect(chip.className).not.toContain('shadow-card');
    });
  });
});
