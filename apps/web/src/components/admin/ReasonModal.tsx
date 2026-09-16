'use client';

/**
 * Модалка причины для действий модерации, у которых причина обязательна.
 *
 * Одна модалка на два действия — скрытие публикации и отзыв проверки (38.54):
 * форма и правило у них одни («без причины нельзя»), различаются только тексты.
 * Тексты — в словаре `REASON_COPY` по назначению модалки: третье действие
 * с причиной добавится строкой словаря, а не третьей модалкой.
 *
 * Причина обязательна — кнопка подтверждения заблокирована, пока поле пустое.
 * Черновик не переживает закрытие: открытая заново модалка чиста, и причина
 * одной публикации не утекает к другой (фаза 35 ловила это на модалке отказа).
 */
import { useState } from 'react';

import { Modal } from '@/components/ui/Modal';

/** Назначение модалки — какое действие подтверждается причиной. */
export type ReasonPurpose = 'hide' | 'unverify';

type ReasonCopy = {
  title: string;
  /** Пояснение — с именем публикации, чтобы человек видел, что именно трогает. */
  description: (entityName: string) => string;
  placeholder: string;
  /** Подпись поля для экранного диктора. */
  inputLabel: string;
  confirmLabel: string;
  pendingLabel: string;
};

const REASON_COPY: Record<ReasonPurpose, ReasonCopy> = {
  hide: {
    title: 'Скрыть публикацию',
    description: (name) =>
      `Укажите причину скрытия «${name}». Провайдер увидит эту причину в личном кабинете.`,
    placeholder: 'Причина скрытия...',
    inputLabel: 'Причина скрытия',
    confirmLabel: 'Скрыть',
    pendingLabel: 'Скрываем…',
  },
  unverify: {
    title: 'Отозвать подтверждение',
    description: (name) =>
      `Укажите причину отзыва проверки «${name}». Владелец получит её уведомлением — без имени администратора.`,
    placeholder: 'Причина отзыва...',
    inputLabel: 'Причина отзыва',
    confirmLabel: 'Отозвать',
    pendingLabel: 'Отзываем…',
  },
};

interface ReasonModalProps {
  open: boolean;
  purpose: ReasonPurpose;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  entityName: string;
  loading?: boolean;
}

export function ReasonModal({
  open,
  purpose,
  onClose,
  onConfirm,
  entityName,
  loading,
}: ReasonModalProps) {
  const copy = REASON_COPY[purpose];
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
      title={copy.title}
      description={copy.description(entityName)}
    >
      <div className="flex flex-col gap-4">
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={copy.placeholder}
          rows={3}
          className="w-full rounded-[12px] border border-line bg-card-2 px-4 py-3 text-sm text-ink placeholder:text-disabled focus:border-lime focus:outline-none"
          aria-label={copy.inputLabel}
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
            {loading ? copy.pendingLabel : copy.confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
