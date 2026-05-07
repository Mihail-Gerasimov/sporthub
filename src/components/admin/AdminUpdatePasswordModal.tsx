/**
 * Phase 29 Step 29.7: модалка «Сменить пароль» для админ-карточки на
 * `/service-portal/dashboard`. Принимает userId и adminUserId, валидирует
 * новый пароль (≥6) + подтверждение, шлёт POST /api/admin/users/[id]/password.
 *
 * Стилизация — `.claude/skills/frontend-design/SKILL.md`: rounded-[24px]
 * Modal с shadow-floating, lime-кнопка primary, font-mono для значений
 * паролей не нужен (это input). Mobile-first: кнопки в footer'е full-width
 * в столбик на 480.
 */
'use client';

import { useId, useState, type FormEvent } from 'react';

import { Button, Modal } from '@/components/ui';
import { useToastStore } from '@/stores/useToastStore';

interface AdminUpdatePasswordModalProps {
  open: boolean;
  onClose: () => void;
  userId: number;
  userName: string;
  adminUserId: number;
  /** Опц. callback после успеха — например, для обновления seed-snapshot'а. */
  onSuccess?: () => void;
}

export function AdminUpdatePasswordModal({
  open,
  onClose,
  userId,
  userName,
  adminUserId,
  onSuccess,
}: AdminUpdatePasswordModalProps) {
  const newPwdId = useId();
  const confirmPwdId = useId();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const addToast = useToastStore((state) => state.addToast);

  const handleClose = () => {
    if (submitting) return;
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
    setShowPassword(false);
    onClose();
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (newPassword.length < 6) {
      setError('Пароль — минимум 6 символов');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/admin/users/${userId}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminUserId, newPassword }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        addToast({ message: body?.error ?? 'Не удалось обновить пароль', tone: 'error' });
        setError(body?.error ?? 'Не удалось обновить пароль');
        return;
      }
      addToast({ message: `Пароль ${userName} обновлён`, tone: 'success' });
      onSuccess?.();
      // Reset + close.
      setNewPassword('');
      setConfirmPassword('');
      setShowPassword(false);
      onClose();
    } catch {
      addToast({ message: 'Не удалось обновить пароль', tone: 'error' });
      setError('Не удалось обновить пароль');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Сменить пароль"
      description={`Новый пароль для пользователя «${userName}». Текущий пароль не нужен — действие админское и логируется.`}
      className="max-w-md"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="rounded-pill border border-line bg-panel px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-lime hover:text-lime disabled:opacity-50"
          >
            Отмена
          </button>
          <Button
            type="submit"
            form="admin-password-form"
            disabled={submitting}
            data-testid="admin-update-password-submit"
          >
            {submitting ? 'Сохраняем…' : 'Сменить пароль'}
          </Button>
        </div>
      }
    >
      <form id="admin-password-form" className="flex flex-col gap-3" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-2">
          <label
            htmlFor={newPwdId}
            className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted"
          >
            Новый пароль
          </label>
          <div className="flex items-center gap-2">
            <input
              id={newPwdId}
              data-testid="admin-update-password-new"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => {
                setNewPassword(event.target.value);
                setError(null);
              }}
              className="flex-1 rounded-card border border-line bg-canvas px-3 py-2 text-sm text-ink focus:border-lime focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="rounded-pill border border-line bg-panel px-3 py-1.5 text-xs font-semibold text-muted hover:border-lime hover:text-lime"
              aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
            >
              {showPassword ? 'Скрыть' : 'Показать'}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor={confirmPwdId}
            className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted"
          >
            Повторите новый пароль
          </label>
          <input
            id={confirmPwdId}
            data-testid="admin-update-password-confirm"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => {
              setConfirmPassword(event.target.value);
              setError(null);
            }}
            className="rounded-card border border-line bg-canvas px-3 py-2 text-sm text-ink focus:border-lime focus:outline-none"
          />
        </div>

        {error ? (
          <p data-testid="admin-update-password-error" className="text-xs text-red">
            {error}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
