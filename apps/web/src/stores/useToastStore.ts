// Phase 24 Step 24.6: Zustand-store для toast-уведомлений о собственных действиях
// пользователя (подтверждение записи, отмена, отправка отзыва и т.д.). Заменяет
// локальный паттерн useState<string|null> + <ActionNotice> в каждом компоненте.
//
// Концептуально отличается от in-app Notification (Step 24.5): toast — мгновенный
// feedback на действие текущего пользователя, auto-dismiss через N секунд, не
// сохраняется. Notification — персистентное уведомление, приходит с сервера
// (booking FSM, link-события, отзывы), хранится в базе.
'use client';

import { create } from 'zustand';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

export type Toast = {
  id: string;
  message: string;
  tone: ToastTone;
  /** Длительность показа в миллисекундах. 0 — без auto-dismiss. */
  duration: number;
};

type ToastInput = {
  message: string;
  tone?: ToastTone;
  duration?: number;
};

export type ToastStoreState = {
  toasts: Toast[];
  addToast: (input: ToastInput) => string;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
};

// Счётчик для уникальных id в пределах сессии. Toast'ы короткоживущие, коллизий нет.
let toastIdCounter = 0;

function generateToastId(): string {
  toastIdCounter += 1;
  return `toast-${Date.now()}-${toastIdCounter}`;
}

/**
 * useToastStore — глобальный store для стека toast'ов. Монтируется один раз через
 * `<ToastStack />` в AppShell; вызывающие компоненты получают только `addToast`,
 * не подписываются на `toasts` — это убирает лишние ре-рендеры.
 */
export const useToastStore = create<ToastStoreState>((set) => ({
  toasts: [],
  addToast: ({ message, tone = 'info', duration = 4000 }) => {
    const id = generateToastId();

    set((state) => ({
      toasts: [...state.toasts, { id, message, tone, duration }],
    }));

    return id;
  },
  dismissToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    }));
  },
  clearToasts: () => {
    set({ toasts: [] });
  },
}));
