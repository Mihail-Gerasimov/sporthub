/**
 * Модалка «Сменить пароль» для админ-карточки на `/service-portal/dashboard`.
 * Принимает userId — ЧЕЙ пароль меняют, валидирует новый пароль (≥6)
 * + подтверждение, шлёт POST /api/admin/users/[id]/password.
 *
 * Phase 34 Step 34.49: поле `adminUserId` из тела ушло. Кто меняет — сервер
 * знает из сессии, а тело он теперь разбирает строго и на лишнее поле отвечает
 * отказом. Раньше исполнителя называл браузер, и подставить туда можно было
 * что угодно.
 *
 * Phase 33 Step 33.10. Пароли теперь хранятся хешем, показывать чужой нечего —
 * этот показ убран из карточки пользователя. Взамен модалка умеет:
 *   • выдать стойкий пароль кнопкой «Сгенерировать»;
 *   • показать выданное значение ОДИН раз после сохранения, с копированием, —
 *     чтобы админ мог продиктовать или переслать его человеку.
 * Одноразовость не формальность: закрыли окно — значение не восстановить
 * ниоткуда, ни из ответа сервера, ни из хранилища. Ровно этого и добивались.
 *
 * Стилизация — `.claude/skills/frontend-design/SKILL.md`: rounded-[24px]
 * Modal с shadow-floating, lime-кнопка primary. Mobile-first: кнопки в footer'е
 * full-width в столбик на 480.
 */
'use client';

import { useId, useState, type FormEvent } from 'react';

import { Button, Modal } from '@/components/ui';
import { generatePassword } from '@/lib/generate-password';
import { useToastStore } from '@/stores/useToastStore';

interface AdminUpdatePasswordModalProps {
  open: boolean;
  onClose: () => void;
  userId: number;
  userName: string;
  /** Опц. callback после успеха — например, для обновления seed-snapshot'а. */
  onSuccess?: () => void;
}

export function AdminUpdatePasswordModal({
  open,
  onClose,
  userId,
  userName,
  onSuccess,
}: AdminUpdatePasswordModalProps) {
  const newPwdId = useId();
  const confirmPwdId = useId();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // Выданное значение живёт только здесь и только до закрытия окна.
  const [issuedPassword, setIssuedPassword] = useState<string | null>(null);

  const addToast = useToastStore((state) => state.addToast);

  /** Полный сброс: вызывается и при закрытии, и после показа выданного пароля. */
  const resetFields = () => {
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
    setShowPassword(false);
    setIssuedPassword(null);
  };

  const handleClose = () => {
    if (submitting) return;
    resetFields();
    onClose();
  };

  /**
   * Сгенерировать пароль. Заполняются оба поля сразу — подтверждать вручную
   * значение, которого админ не набирал, бессмысленно, — и включается показ,
   * иначе выданное нечем прочитать.
   */
  const handleGenerate = () => {
    const generated = generatePassword();

    setNewPassword(generated);
    setConfirmPassword(generated);
    setShowPassword(true);
    setError(null);
  };

  /** Копирование выданного значения в буфер обмена. */
  const handleCopy = async () => {
    if (!issuedPassword) return;

    try {
      await navigator.clipboard.writeText(issuedPassword);
      addToast({ message: 'Пароль скопирован', tone: 'success' });
    } catch {
      // Буфер может быть недоступен (нет разрешения, небезопасный источник) —
      // значение при этом на экране, переписать его руками можно.
      addToast({ message: 'Не удалось скопировать — перепишите вручную', tone: 'error' });
    }
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
        body: JSON.stringify({ newPassword }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        addToast({ message: body?.error ?? 'Не удалось обновить пароль', tone: 'error' });
        setError(body?.error ?? 'Не удалось обновить пароль');
        return;
      }
      addToast({ message: `Пароль ${userName} обновлён`, tone: 'success' });
      onSuccess?.();
      // Окно не закрывается: переходим к одноразовому показу выданного значения.
      // Поля ввода очищаются сразу — в разметке их больше нет.
      setIssuedPassword(newPassword);
      setNewPassword('');
      setConfirmPassword('');
      setShowPassword(false);
    } catch {
      addToast({ message: 'Не удалось обновить пароль', tone: 'error' });
      setError('Не удалось обновить пароль');
    } finally {
      setSubmitting(false);
    }
  }

  // --- Экран после сохранения: значение показывается один раз ---------------
  if (issuedPassword) {
    return (
      <Modal
        open={open}
        onClose={handleClose}
        title="Пароль выдан"
        description={`Новый пароль для пользователя «${userName}». Значение показывается один раз — после закрытия окна восстановить его будет неоткуда.`}
        className="max-w-md"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              onClick={handleClose}
              data-testid="admin-update-password-done"
              fullWidth
            >
              Готово
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            Новый пароль
          </span>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <code
              data-testid="admin-update-password-issued"
              className="flex-1 break-all rounded-card border border-line bg-canvas px-3 py-2 font-mono text-sm text-ink"
            >
              {issuedPassword}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              data-testid="admin-update-password-copy"
              className="rounded-pill border border-line bg-panel px-3 py-2 text-xs font-semibold text-ink hover:border-lime hover:text-lime"
            >
              Скопировать
            </button>
          </div>
          <p className="m-0 text-xs text-muted">
            Передайте пароль пользователю. В базе он хранится хешем — ни админка, ни поддержка
            больше его не покажут.
          </p>
        </div>
      </Modal>
    );
  }

  // --- Экран ввода ----------------------------------------------------------
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
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor={newPwdId}
              className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted"
            >
              Новый пароль
            </label>
            <button
              type="button"
              onClick={handleGenerate}
              data-testid="admin-update-password-generate"
              className="rounded-pill border border-line bg-panel px-3 py-1 text-[11px] font-semibold text-ink hover:border-lime hover:text-lime"
            >
              Сгенерировать
            </button>
          </div>
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
              className="flex-1 rounded-card border border-line bg-canvas px-3 py-2 font-mono text-sm text-ink focus:border-lime focus:outline-none"
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
            className="rounded-card border border-line bg-canvas px-3 py-2 font-mono text-sm text-ink focus:border-lime focus:outline-none"
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
