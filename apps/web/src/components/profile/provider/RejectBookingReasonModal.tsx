// Модалка указания причины отклонения booking'а провайдером (Phase 27 Step 27.13).
// Причина опциональная: backend (POST /api/bookings/[id]/reject) принимает reason
// необязательно, copy уведомления (notification-copy.ts) сам выбирает текст —
// «Причина: …» когда reason передан, fallback-описание когда нет.
'use client';

import { useState } from 'react';

import { Modal } from '@/components/ui/Modal';

type RejectBookingReasonModalProps = {
  open: boolean;
  athleteName: string;
  onClose: () => void;
  onConfirm: (reason: string | null) => void;
  loading?: boolean;
};

export function RejectBookingReasonModal({
  open,
  athleteName,
  onClose,
  onConfirm,
  loading = false,
}: RejectBookingReasonModalProps) {
  const [reason, setReason] = useState('');

  // Сбрасываем поле при закрытии — модалка переиспользуется одним монтажом
  // под все карточки списка, нельзя оставлять текст от предыдущей сессии.
  const handleClose = () => {
    setReason('');
    onClose();
  };

  const handleSubmit = () => {
    const trimmed = reason.trim();
    setReason('');
    onConfirm(trimmed.length > 0 ? trimmed : null);
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Отклонить запись"
      description={`Спортсмен ${athleteName} получит уведомление об отказе. Причина указывается по желанию — её увидит атлет в карточке уведомления.`}
    >
      <div className="space-y-4" data-testid="provider-reject-reason-modal">
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Например: время не подходит, нет свободного места…"
          rows={3}
          className="w-full rounded-card border border-line bg-canvas px-4 py-3 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
          aria-label="Причина отказа (необязательно)"
          data-testid="provider-reject-reason-textarea"
        />
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            className="rounded-pill border border-line px-5 py-2.5 text-sm font-medium text-muted transition-colors hover:text-ink disabled:opacity-50"
            data-testid="provider-reject-reason-cancel"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="rounded-pill bg-danger px-5 py-2.5 text-sm font-medium text-card transition-opacity hover:opacity-90 disabled:opacity-50"
            data-testid="provider-reject-reason-submit"
          >
            {loading ? 'Отклоняем…' : 'Отклонить'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
