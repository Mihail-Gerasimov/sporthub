import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useUIStore } from '@/stores/useUIStore';

function UIStoreProbe() {
  const isAuthModalOpen = useUIStore((state) => state.isAuthModalOpen);
  const openAuthModal = useUIStore((state) => state.openAuthModal);
  const closeAuthModal = useUIStore((state) => state.closeAuthModal);

  return (
    <section>
      <p data-testid="auth-state">{isAuthModalOpen ? 'открыто' : 'закрыто'}</p>
      <button type="button" onClick={openAuthModal}>
        Открыть auth
      </button>
      <button type="button" onClick={closeAuthModal}>
        Закрыть auth
      </button>
    </section>
  );
}

describe('useUIStore', () => {
  beforeEach(() => {
    useUIStore.setState({
      isAuthModalOpen: false,
    });
  });

  it('управляет состоянием auth modal через actions', () => {
    act(() => {
      useUIStore.getState().openAuthModal();
    });

    expect(useUIStore.getState().isAuthModalOpen).toBe(true);

    act(() => {
      useUIStore.getState().closeAuthModal();
    });

    expect(useUIStore.getState().isAuthModalOpen).toBe(false);
  });

  it('реактивно обновляет UI при открытии и закрытии auth modal state', () => {
    render(<UIStoreProbe />);

    fireEvent.click(screen.getByRole('button', { name: 'Открыть auth' }));
    expect(screen.getByTestId('auth-state')).toHaveTextContent('открыто');

    fireEvent.click(screen.getByRole('button', { name: 'Закрыть auth' }));
    expect(screen.getByTestId('auth-state')).toHaveTextContent('закрыто');
  });
});
