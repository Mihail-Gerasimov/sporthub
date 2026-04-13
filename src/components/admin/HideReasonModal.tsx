'use client';

/**
 * Модалка для указания причины скрытия публикации.
 * Причина обязательна — кнопка «Скрыть» заблокирована пока поле пустое.
 */
import { useState } from 'react';

import { Modal } from '@/components/ui/Modal';

interface HideReasonModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  entityName: string;
  loading?: boolean;
}

export function HideReasonModal({
  open,
  onClose,
  onConfirm,
  entityName,
  loading,
}: HideReasonModalProps) {
  const [reason, setReason] = useState('');

  const handleSubmit = () => {
    if (!reason.trim()) return;
    onConfirm(reason.trim());
    setReason('');
  };

  const handleClose = () => {
    setReason('');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Скрыть публикацию"
      description={`Укажите причину скрытия «${entityName}». Провайдер увидит эту причину в личном кабинете.`}
    >
      <div className="space-y-4">
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Причина скрытия..."
          rows={3}
          className="w-full rounded-card border border-line bg-canvas px-4 py-3 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
          aria-label="Причина скрытия"
        />
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-pill border border-line px-5 py-2.5 text-sm font-medium text-muted transition-colors hover:text-ink"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!reason.trim() || loading}
            className="rounded-pill bg-danger px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Скрываем...' : 'Скрыть'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
