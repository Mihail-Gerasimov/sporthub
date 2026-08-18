// Тесты общего каркаса publish-модалок (Step 13.2)
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PublishModalShell } from '@/components/profile/PublishModalShell';

describe('PublishModalShell', () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    title: 'Тестовая модалка',
    description: 'Описание модалки',
    primaryLabel: 'Создать',
    onPrimary: vi.fn(),
  };

  it('рендерит title и description', () => {
    render(
      <PublishModalShell {...defaultProps}>
        <p>Контент формы</p>
      </PublishModalShell>,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('h2')).toHaveTextContent('Тестовая модалка');
    expect(screen.getByText('Описание модалки')).toBeInTheDocument();
  });

  it('рендерит children (контент формы)', () => {
    render(
      <PublishModalShell {...defaultProps}>
        <p>Контент формы</p>
      </PublishModalShell>,
    );

    expect(screen.getByText('Контент формы')).toBeInTheDocument();
  });

  it('рендерит primary и secondary кнопки в footer', () => {
    render(
      <PublishModalShell {...defaultProps} secondaryLabel="Отмена" onSecondary={vi.fn()}>
        <p>Контент</p>
      </PublishModalShell>,
    );

    expect(screen.getByRole('button', { name: 'Создать' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Отмена' })).toBeInTheDocument();
  });

  it('вызывает onPrimary при клике на primary кнопку', () => {
    const onPrimary = vi.fn();

    render(
      <PublishModalShell {...defaultProps} onPrimary={onPrimary}>
        <p>Контент</p>
      </PublishModalShell>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Создать' }));
    expect(onPrimary).toHaveBeenCalledOnce();
  });

  it('вызывает onSecondary при клике на secondary кнопку', () => {
    const onSecondary = vi.fn();

    render(
      <PublishModalShell {...defaultProps} secondaryLabel="Отмена" onSecondary={onSecondary}>
        <p>Контент</p>
      </PublishModalShell>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(onSecondary).toHaveBeenCalledOnce();
  });

  it('рендерит notice когда передан', () => {
    render(
      <PublishModalShell {...defaultProps} notice="Сохранение будет доступно позже">
        <p>Контент</p>
      </PublishModalShell>,
    );

    expect(screen.getByText('Сохранение будет доступно позже')).toBeInTheDocument();
  });

  it('не рендерит notice когда не передан', () => {
    render(
      <PublishModalShell {...defaultProps}>
        <p>Контент</p>
      </PublishModalShell>,
    );

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('содержит scrollable-контейнер для длинных форм', () => {
    render(
      <PublishModalShell {...defaultProps}>
        <p>Контент</p>
      </PublishModalShell>,
    );

    const scrollContainer = screen.getByTestId('publish-modal-body');
    expect(scrollContainer.className).toMatch(/overflow-y-auto/);
    expect(scrollContainer.className).toMatch(/scrollbar-hidden/);
  });

  it('не рендерится когда open=false', () => {
    render(
      <PublishModalShell {...defaultProps} open={false}>
        <p>Контент</p>
      </PublishModalShell>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('не зависит от предметной логики — принимает произвольный children', () => {
    render(
      <PublishModalShell {...defaultProps}>
        <input placeholder="Любое поле" />
        <select>
          <option>Опция</option>
        </select>
      </PublishModalShell>,
    );

    expect(screen.getByPlaceholderText('Любое поле')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });
});
