// Phase 24 Step 24.6: рендер-контейнер для стека toast-уведомлений.
// Монтируется один раз в AppShell, подписывается на useToastStore, отображает
// очередь toast'ов в правом нижнем углу, каждый — с auto-dismiss через duration.
// Разные tone (info/success/warning/error) дают разные цвета в соответствии с
// дизайн-токенами проекта.
'use client';

import { useEffect } from 'react';

import { useToastStore, type Toast, type ToastTone } from '@/stores/useToastStore';

// Тональные стили: фон, обводка, текст. Используем Tailwind-классы дизайн-системы
// (panel/line/success/accent). Для 'danger'/warning — accent-ветка.
const TONE_STYLES: Record<ToastTone, string> = {
  info: 'border-line bg-panel text-ink',
  success: 'border-success/40 bg-success/10 text-success',
  warning: 'border-accent/40 bg-accent/10 text-accent',
  error: 'border-accent/40 bg-accent/10 text-accent',
};

type ToastItemProps = {
  toast: Toast;
  onDismiss: (id: string) => void;
};

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  useEffect(() => {
    // duration=0 означает ручное закрытие только по клику.
    if (toast.duration <= 0) {
      return;
    }

    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, toast.duration);

    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-auto flex max-w-sm items-start gap-3 rounded-card border px-4 py-3 text-sm font-medium shadow-floating ${TONE_STYLES[toast.tone]}`}
    >
      <p className="flex-1">{toast.message}</p>
      <button
        type="button"
        aria-label="Закрыть уведомление"
        onClick={() => onDismiss(toast.id)}
        className="-mr-1 -mt-1 rounded-full p-1 text-sm leading-none opacity-60 transition hover:opacity-100"
      >
        ×
      </button>
    </div>
  );
}

/**
 * ToastStack — глобальный контейнер для toast'ов. Фиксированная позиция bottom-right,
 * pointer-events сбрасываются на wrapper (чтобы не перекрывать кликабельные элементы
 * под ним, кроме самих toast-карточек).
 */
export function ToastStack() {
  const toasts = useToastStore((state) => state.toasts);
  const dismissToast = useToastStore((state) => state.dismissToast);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={dismissToast} />
      ))}
    </div>
  );
}
