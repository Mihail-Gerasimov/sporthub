'use client';

import { useEffect, useId, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function Modal({
  children,
  className,
  description,
  footer,
  onClose,
  open,
  title,
}: ModalProps) {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      data-testid="modal-overlay"
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(21,35,42,0.56)] p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        className={cn(
          'w-full max-w-xl rounded-card border border-line bg-panel p-5 shadow-floating sm:p-6',
          className,
        )}
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            {title ? (
              <h2 id={titleId} className="font-display text-2xl font-semibold text-ink">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p id={descriptionId} className="text-sm leading-7 text-muted">
                {description}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-10 items-center justify-center rounded-pill border border-line bg-canvas text-lg text-muted transition-colors hover:text-ink"
            aria-label="Закрыть модальное окно"
          >
            ×
          </button>
        </div>

        <div className="mt-5 text-sm leading-7 text-ink">{children}</div>

        {footer ? <div className="mt-6">{footer}</div> : null}
      </div>
    </div>
  );
}
