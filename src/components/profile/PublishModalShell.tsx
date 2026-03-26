// Общий каркас publish-модалок: scrollable body, footer, notice (Step 13.2).
// Используется как обёртка для PublishClubModal и PublishTrainerModal.
'use client';

import type { ReactNode } from 'react';

import { Button } from '@/components/ui';
import { Modal } from '@/components/ui';

type PublishModalShellProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Текст primary-кнопки в footer */
  primaryLabel: string;
  onPrimary: () => void;
  /** Текст secondary-кнопки в footer (не рендерится если не задан) */
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** Информационное уведомление (stub / validation summary) */
  notice?: string;
};

export function PublishModalShell({
  children,
  description,
  notice,
  onClose,
  onPrimary,
  onSecondary,
  open,
  primaryLabel,
  secondaryLabel,
  title,
}: PublishModalShellProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <div className="flex flex-col gap-3">
          {/* Notice-зона */}
          {notice ? (
            <div
              role="status"
              className="rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
            >
              {notice}
            </div>
          ) : null}

          {/* Кнопки footer */}
          <div className="flex flex-wrap gap-3">
            <Button onClick={onPrimary}>{primaryLabel}</Button>
            {secondaryLabel && onSecondary ? (
              <Button variant="outline" onClick={onSecondary}>
                {secondaryLabel}
              </Button>
            ) : null}
          </div>
        </div>
      }
    >
      {/* Scrollable body для длинных форм */}
      <div data-testid="publish-modal-body" className="max-h-[60vh] overflow-y-auto">
        {children}
      </div>
    </Modal>
  );
}
