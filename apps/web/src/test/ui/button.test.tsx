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
});
