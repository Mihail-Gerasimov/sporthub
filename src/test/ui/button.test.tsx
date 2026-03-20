import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button } from '@/components/ui/Button';

describe('Button', () => {
  it('показывает loading-состояние и блокирует кнопку', () => {
    render(<Button loading>Записаться</Button>);

    const button = screen.getByRole('button');

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Загрузка…')).toBeInTheDocument();
    // children скрыты в loading-режиме — текст кнопки не дублируется
    expect(screen.queryByText('Записаться')).not.toBeInTheDocument();
  });

  it('показывает children и иконки в обычном состоянии', () => {
    render(<Button leadingIcon={<span data-testid="icon-lead">→</span>}>Записаться</Button>);

    const button = screen.getByRole('button');

    expect(button).not.toBeDisabled();
    expect(button).not.toHaveAttribute('aria-busy');
    expect(screen.getByText('Записаться')).toBeInTheDocument();
    expect(screen.getByTestId('icon-lead')).toBeInTheDocument();
    expect(screen.queryByText('Загрузка…')).not.toBeInTheDocument();
  });
});
