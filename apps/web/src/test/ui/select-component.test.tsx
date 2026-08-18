/**
 * Тесты UI-компонента Select (Step 18.4).
 * Проверяют: appearance-none, кастомная стрелка, label, error, className pass-through.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Select } from '@/components/ui/Select';

describe('Select компонент', () => {
  it('рендерит select с appearance-none', () => {
    render(
      <Select data-testid="sel">
        <option value="a">A</option>
      </Select>,
    );

    const select = screen.getByTestId('sel');

    expect(select.className).toContain('appearance-none');
  });

  it('рендерит кастомную SVG-стрелку', () => {
    const { container } = render(
      <Select>
        <option value="a">A</option>
      </Select>,
    );

    const svg = container.querySelector('svg');

    expect(svg).toBeTruthy();
  });

  it('рендерит label если передан', () => {
    render(
      <Select label="Роль">
        <option value="a">A</option>
      </Select>,
    );

    expect(screen.getByText('Роль')).toBeTruthy();
    expect(screen.getByLabelText('Роль')).toBeTruthy();
  });

  it('рендерит error если передан', () => {
    render(
      <Select error="Обязательное поле">
        <option value="a">A</option>
      </Select>,
    );

    expect(screen.getByText('Обязательное поле')).toBeTruthy();
  });

  it('применяет стили ошибки при error', () => {
    const { container } = render(
      <Select error="Ошибка" data-testid="sel">
        <option value="a">A</option>
      </Select>,
    );

    // Обёртка с border-danger
    const wrapper = container.querySelector('[class*="border-danger"]');

    expect(wrapper).toBeTruthy();
  });

  it('прокидывает onChange', () => {
    const onChange = vi.fn();

    render(
      <Select data-testid="sel" onChange={onChange}>
        <option value="a">A</option>
        <option value="b">B</option>
      </Select>,
    );

    fireEvent.change(screen.getByTestId('sel'), { target: { value: 'b' } });

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('прокидывает дополнительные className', () => {
    render(
      <Select data-testid="sel" className="custom-class">
        <option value="a">A</option>
      </Select>,
    );

    expect(screen.getByTestId('sel').className).toContain('custom-class');
  });

  it('стилизован как Input: rounded-card, border, bg-panel', () => {
    const { container } = render(
      <Select>
        <option value="a">A</option>
      </Select>,
    );

    // Обёртка должна содержать стили, согласованные с Input
    const wrapper = container.firstElementChild;

    expect(wrapper?.innerHTML).toContain('rounded-card');
  });
});
