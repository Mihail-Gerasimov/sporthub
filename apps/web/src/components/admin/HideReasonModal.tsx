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
      <div className="flex flex-col gap-4">
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Причина скрытия..."
          rows={3}
          className="w-full rounded-[12px] border border-line bg-card-2 px-4 py-3 text-sm text-ink placeholder:text-disabled focus:border-lime focus:outline-none"
          aria-label="Причина скрытия"
        />
        <div className="flex flex-wrap justify-end gap-2.5">
          <button
            type="button"
            onClick={handleClose}
            className="inline-flex items-center justify-center rounded-full border border-line bg-transparent px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-ink transition-colors hover:border-lime hover:text-lime-hov"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!reason.trim() || loading}
            className="inline-flex items-center justify-center rounded-full border border-red/45 bg-transparent px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-red transition-colors hover:border-red hover:bg-red hover:text-card disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Скрываем…' : 'Скрыть'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
