import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Modal } from '@/components/ui/Modal';

describe('Modal', () => {
  it('закрывается по Escape', () => {
    const handleClose = vi.fn();

    render(
      <Modal open onClose={handleClose} title="Войти">
        Содержимое модалки
      </Modal>,
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('закрывается по клику вне контента', () => {
    const handleClose = vi.fn();

    render(
      <Modal open onClose={handleClose} title="Войти">
        Содержимое модалки
      </Modal>,
    );

    fireEvent.click(screen.getByTestId('modal-overlay'));

    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
