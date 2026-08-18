// Phase 24 Step 24.6: тесты Zustand-store useToastStore — addToast, dismissToast,
// clearToasts; уникальные id; defaults (tone='info', duration=4000).
import { beforeEach, describe, expect, it } from 'vitest';

import { useToastStore } from '@/stores/useToastStore';

describe('useToastStore', () => {
  beforeEach(() => {
    // Сброс стора между тестами — toasts могут остаться от предыдущего.
    useToastStore.getState().clearToasts();
  });

  it('addToast добавляет toast с уникальным id и дефолтами', () => {
    const { addToast } = useToastStore.getState();
    const id = addToast({ message: 'Тестовое сообщение' });

    const { toasts } = useToastStore.getState();

    expect(toasts).toHaveLength(1);
    expect(toasts[0].id).toBe(id);
    expect(toasts[0].message).toBe('Тестовое сообщение');
    expect(toasts[0].tone).toBe('info');
    expect(toasts[0].duration).toBe(4000);
  });

  it('addToast принимает tone и duration override', () => {
    const { addToast } = useToastStore.getState();
    addToast({ message: 'Успех!', tone: 'success', duration: 2000 });

    const { toasts } = useToastStore.getState();

    expect(toasts[0].tone).toBe('success');
    expect(toasts[0].duration).toBe(2000);
  });

  it('addToast возвращает разные id для повторных вызовов', () => {
    const { addToast } = useToastStore.getState();
    const id1 = addToast({ message: 'Первый' });
    const id2 = addToast({ message: 'Второй' });

    expect(id1).not.toBe(id2);
    expect(useToastStore.getState().toasts).toHaveLength(2);
  });

  it('dismissToast удаляет конкретный toast по id', () => {
    const { addToast, dismissToast } = useToastStore.getState();
    const id1 = addToast({ message: 'Первый' });
    addToast({ message: 'Второй' });

    dismissToast(id1);

    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toBe('Второй');
  });

  it('dismissToast с несуществующим id не меняет стек', () => {
    const { addToast, dismissToast } = useToastStore.getState();
    addToast({ message: 'Первый' });

    dismissToast('nonexistent-id');

    expect(useToastStore.getState().toasts).toHaveLength(1);
  });

  it('clearToasts удаляет все toast-ы', () => {
    const { addToast, clearToasts } = useToastStore.getState();
    addToast({ message: 'a' });
    addToast({ message: 'b' });
    addToast({ message: 'c' });

    clearToasts();

    expect(useToastStore.getState().toasts).toHaveLength(0);
  });
});
