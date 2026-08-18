import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Input } from '@/components/ui/Input';

describe('Input', () => {
  it('рендерит label, icon и error state', () => {
    render(
      <Input
        label="Поиск клуба"
        error="Поле обязательно"
        icon={<span data-testid="input-icon">⌕</span>}
        placeholder="Введите запрос"
      />,
    );

    const input = screen.getByLabelText('Поиск клуба');

    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('input-icon')).toBeInTheDocument();
    expect(screen.getByText('Поле обязательно')).toBeInTheDocument();
  });
});
