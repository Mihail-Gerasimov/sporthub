// Smoke-тесты модалки причины раздела модерации (Step 22.4; шаг 38.54 — одна
// модалка на скрытие и отзыв проверки, тексты по назначению).
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ReasonModal } from '@/components/admin/ReasonModal';

describe('ReasonModal', () => {
  it('для скрытия рендерит поле причины и кнопки', () => {
    render(
      <ReasonModal
        open={true}
        purpose="hide"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        entityName="Тестовый клуб"
      />,
    );

    expect(screen.getByLabelText('Причина скрытия')).toBeInTheDocument();
    expect(screen.getByText('Скрыть')).toBeInTheDocument();
    expect(screen.getByText('Отмена')).toBeInTheDocument();
    expect(screen.getByText(/Тестовый клуб/)).toBeInTheDocument();
  });

  it('кнопка подтверждения заблокирована, пока причина пустая', () => {
    render(
      <ReasonModal
        open={true}
        purpose="hide"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        entityName="Клуб"
      />,
    );

    expect(screen.getByText('Скрыть')).toBeDisabled();
  });

  it('для отзыва проверки — свои тексты: поле «Причина отзыва», кнопка «Отозвать», без имени администратора', () => {
    render(
      <ReasonModal
        open={true}
        purpose="unverify"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        entityName="Проверенный"
      />,
    );

    expect(screen.getByLabelText('Причина отзыва')).toBeInTheDocument();
    expect(screen.getByText('Отозвать')).toBeDisabled();
    expect(screen.getByText(/без имени администратора/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Причина скрытия')).not.toBeInTheDocument();
  });

  it('не рендерится если open=false', () => {
    render(
      <ReasonModal
        open={false}
        purpose="hide"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        entityName="Клуб"
      />,
    );

    expect(screen.queryByLabelText('Причина скрытия')).not.toBeInTheDocument();
  });
});
