// Phase 24 Step 24.6: helper для тестов, где проверяются toast-уведомления.
// Обёртка над testing-library/render: монтирует ToastStack вместе с компонентом и
// очищает useToastStore перед рендером — чтобы toast-сообщения появлялись в DOM
// и не переносились между тестами.
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';

import { ToastStack } from '@/components/ui/ToastStack';
import { useToastStore } from '@/stores/useToastStore';

export function renderWithToast(ui: ReactElement, options?: RenderOptions): RenderResult {
  useToastStore.getState().clearToasts();
  return render(
    <>
      {ui}
      <ToastStack />
    </>,
    options,
  );
}

/** Сброс стека toast'ов — удобно вызывать в beforeEach/afterEach. */
export function resetToasts(): void {
  useToastStore.getState().clearToasts();
}
