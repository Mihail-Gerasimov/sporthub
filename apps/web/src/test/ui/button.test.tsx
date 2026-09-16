import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button } from '@/components/ui/Button';

describe('Button', () => {
  it('показывает loading-состояние и блокирует кнопку', () => {
    render(<Button loading>Записаться</Button>);

    const button = screen.getByRole('button');

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveTextContent('Записаться');
    expect(screen.getByText('Загрузка')).toBeInTheDocument();
  });

  it('вариант danger — красная обводка и красный текст, без зелёного (38.54)', () => {
    render(
      <Button variant="danger" size="sm">
        Скрыть
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Скрыть' });

    expect(button.className).toContain('text-red');
    expect(button.className).toContain('border-red');
    expect(button.className).not.toMatch(/\blime\b|bg-lime/);
  });
});
