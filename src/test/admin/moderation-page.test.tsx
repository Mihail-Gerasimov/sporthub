// Smoke-тесты страницы модерации и модалки (Step 22.4)
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { HideReasonModal } from '@/components/admin/HideReasonModal';

describe('HideReasonModal', () => {
  it('рендерит поле причины и кнопки', () => {
    render(
      <HideReasonModal
        open={true}
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

  it('кнопка «Скрыть» заблокирована если причина пустая', () => {
    render(<HideReasonModal open={true} onClose={vi.fn()} onConfirm={vi.fn()} entityName="Клуб" />);

    expect(screen.getByText('Скрыть')).toBeDisabled();
  });

  it('не рендерится если open=false', () => {
    render(
      <HideReasonModal open={false} onClose={vi.fn()} onConfirm={vi.fn()} entityName="Клуб" />,
    );

    expect(screen.queryByLabelText('Причина скрытия')).not.toBeInTheDocument();
  });
});
