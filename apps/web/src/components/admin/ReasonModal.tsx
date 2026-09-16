'use client';

/**
 * Модалка причины для действий модерации, у которых причина обязательна.
 *
 * Одна модалка на все такие действия — сегодня это скрытие публикации и отзыв
 * проверки (38.54): форма и правило у них одни («без причины нельзя»), различаются
 * только тексты. Нужна ли действию причина и как называется отказ без неё, знает
 * словарь действий домена (`MODERATION_ACTION_SPECS[action].requiresReason`) —
 * его строка и есть подсказка под пустым полем. Заголовки и подписи кнопок —
 * в `REASON_COPY` по действию; для действия без своей записи берётся общая
 * (правка по ревью 38.54): новое действие с причиной откроет модалку без правки фронта.
 *
 * Причина обязательна — кнопка подтверждения заблокирована, пока поле пустое.
 * Черновик не переживает закрытие: открытая заново модалка чиста, и причина
 * одной публикации не утекает к другой (фаза 35 ловила это на модалке отказа).
 */
import { useState } from 'react';

import { MODERATION_ACTION_SPECS, type ModerationAction } from '@sporthub/domain';
import { Modal } from '@/components/ui/Modal';

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

const DEFAULT_REASON_COPY: ReasonCopy = {
  title: 'Укажите причину',
  description: (name) =>
    `Действие над «${name}» требует причины: владелец увидит её в уведомлении.`,
  placeholder: 'Причина...',
  inputLabel: 'Причина',
  confirmLabel: 'Подтвердить',
  pendingLabel: 'Отправляем…',
};

const REASON_COPY: Partial<Record<ModerationAction, ReasonCopy>> = {
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
  action: ModerationAction;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  entityName: string;
  loading?: boolean;
}

export function ReasonModal({
  open,
  action,
  onClose,
  onConfirm,
  entityName,
  loading,
}: ReasonModalProps) {
  const copy = REASON_COPY[action] ?? DEFAULT_REASON_COPY;
  // Текст отказа без причины — из словаря домена: тот же, что вернул бы сервер.
  const requirement = MODERATION_ACTION_SPECS[action].requiresReason;
  const [reason, setReason] = useState('');
  const isEmpty = !reason.trim();

  const handleSubmit = () => {
    if (isEmpty) return;
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
        <div className="flex flex-col gap-1.5">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={copy.placeholder}
            rows={3}
            className="w-full rounded-[12px] border border-line bg-card-2 px-4 py-3 text-sm text-ink placeholder:text-disabled focus:border-lime focus:outline-none"
            aria-label={copy.inputLabel}
          />
          {/* Подсказка под пустым полем — словами словаря; исчезает, как только причина есть. */}
          {isEmpty && requirement !== false ? (
            <p className="m-0 text-xs font-medium text-muted">{requirement}</p>
          ) : null}
        </div>
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
            disabled={isEmpty || loading}
            className="inline-flex items-center justify-center rounded-full border border-red/45 bg-transparent px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-red transition-colors hover:border-red hover:bg-red hover:text-card disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? copy.pendingLabel : copy.confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
