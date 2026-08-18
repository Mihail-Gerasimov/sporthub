// Phase 24 Step 24.6: тесты UI-компонента ToastStack — рендер стека из стора,
// auto-dismiss через duration (fake timers), ручное закрытие по клику.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastStack } from '@/components/ui/ToastStack';
import { useToastStore } from '@/stores/useToastStore';

describe('ToastStack', () => {
  beforeEach(() => {
    useToastStore.getState().clearToasts();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('не рендерит контейнер при пустом стеке', () => {
    render(<ToastStack />);
    // В пустом состоянии компонент возвращает null — никаких toast-status role.
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('рендерит toast из стора и показывает его message', () => {
    render(<ToastStack />);
    act(() => {
      useToastStore.getState().addToast({ message: 'Привет из toast', tone: 'success' });
    });

    expect(screen.getByRole('status')).toHaveTextContent('Привет из toast');
  });

  it('auto-dismiss через duration удаляет toast из стека', () => {
    render(<ToastStack />);
    act(() => {
      useToastStore.getState().addToast({ message: 'исчезнет через 1 сек', duration: 1000 });
    });

    expect(screen.getByRole('status')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('duration=0 отключает auto-dismiss — toast живёт до ручного закрытия', () => {
    render(<ToastStack />);
    act(() => {
      useToastStore.getState().addToast({ message: 'никогда не исчезнет сам', duration: 0 });
    });

    act(() => {
      vi.advanceTimersByTime(100000);
    });

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('клик по кнопке закрытия удаляет конкретный toast', () => {
    render(<ToastStack />);
    act(() => {
      useToastStore.getState().addToast({ message: 'с кнопкой закрыть' });
    });

    const closeButton = screen.getByRole('button', { name: 'Закрыть уведомление' });

    act(() => {
      fireEvent.click(closeButton);
    });

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('несколько toast-ов рендерятся одновременно', () => {
    render(<ToastStack />);
    act(() => {
      useToastStore.getState().addToast({ message: 'первый', tone: 'info' });
      useToastStore.getState().addToast({ message: 'второй', tone: 'warning' });
      useToastStore.getState().addToast({ message: 'третий', tone: 'error' });
    });

    expect(screen.getAllByRole('status')).toHaveLength(3);
  });
});
