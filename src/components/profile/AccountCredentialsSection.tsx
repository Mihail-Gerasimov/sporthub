/**
 * Phase 29 Step 29.6: универсальный блок «Учётные данные» для ЛК атлета и
 * провайдера. Email и name read-only (заморожены в этой фазе), phone и
 * password — редактируемые.
 *
 * Поведение под impersonation: если admin вошёл от лица другого пользователя
 * (`isImpersonating === true` в useAuthStore), формы не рендерятся —
 * только notice-плашка. Это MVP-ограничение: чтобы случайно не сменить
 * чужой пароль, для смены под impersonation есть отдельный admin-инструмент
 * (Step 29.7).
 *
 * Стилизация — `.claude/skills/frontend-design/SKILL.md`: rounded-card
 * inputs, lime submit, orange notice для warning. Mobile-first.
 */
'use client';

import { useId, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui';
import { useAuthStore, type AuthSessionUser } from '@/stores/useAuthStore';
import { useToastStore } from '@/stores/useToastStore';

const PHONE_REGEX = /^\+7\s?\(?\d{3}\)?\s?\d{3}[-\s]?\d{2}[-\s]?\d{2}$/;

interface AccountCredentialsSectionProps {
  /** Данные текущего user (email/name/phone). password не нужен. */
  user: AuthSessionUser & { id?: number };
}

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

export function AccountCredentialsSection({ user }: AccountCredentialsSectionProps) {
  const isImpersonating = useAuthStore((state) => state.isImpersonating);
  const updateAuthUser = useAuthStore((state) => state.updateUser);
  const addToast = useToastStore((state) => state.addToast);

  const phoneFieldId = useId();
  const currentPwdId = useId();
  const newPwdId = useId();
  const confirmPwdId = useId();

  // Phone form state.
  const [phone, setPhone] = useState(user.phone ?? '');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [phoneState, setPhoneState] = useState<SubmitState>('idle');

  // Password form state.
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [currentPasswordError, setCurrentPasswordError] = useState<string | null>(null);
  const [passwordState, setPasswordState] = useState<SubmitState>('idle');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  if (isImpersonating) {
    return (
      <section
        data-testid="account-credentials-impersonation-notice"
        className="rounded-card border border-orange/40 bg-orange/10 p-5 text-sm leading-relaxed text-orange"
      >
        <p className="font-display text-base font-semibold uppercase tracking-wide">
          Изменения недоступны
        </p>
        <p className="mt-2 text-ink/90">
          Вы вошли как администратор. Изменение настроек этого пользователя возможно только из
          админ-панели.
        </p>
      </section>
    );
  }

  const userId = user.id;
  const submitsDisabled = userId === undefined;

  async function handlePhoneSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (userId === undefined) return;
    const trimmed = phone.trim();
    if (!PHONE_REGEX.test(trimmed)) {
      setPhoneError('Формат: +7 (XXX) XXX-XX-XX');
      return;
    }
    setPhoneError(null);
    setPhoneState('submitting');
    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, phone: trimmed }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        addToast({ message: body?.error ?? 'Не удалось обновить телефон', tone: 'error' });
        setPhoneState('error');
        return;
      }
      updateAuthUser({ phone: trimmed });
      addToast({ message: 'Телефон обновлён', tone: 'success' });
      setPhoneState('success');
    } catch {
      addToast({ message: 'Не удалось обновить телефон', tone: 'error' });
      setPhoneState('error');
    }
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (userId === undefined) return;
    setPasswordError(null);
    setCurrentPasswordError(null);

    if (newPassword.length < 6) {
      setPasswordError('Пароль — минимум 6 символов');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Новый пароль и подтверждение не совпадают');
      return;
    }
    if (currentPassword.trim().length === 0) {
      setCurrentPasswordError('Введите текущий пароль');
      return;
    }

    setPasswordState('submitting');
    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          password: newPassword,
          currentPassword,
        }),
      });
      if (response.status === 401) {
        setCurrentPasswordError('Неверный текущий пароль');
        addToast({ message: 'Неверный текущий пароль', tone: 'error' });
        setPasswordState('error');
        return;
      }
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        addToast({ message: body?.error ?? 'Не удалось обновить пароль', tone: 'error' });
        setPasswordState('error');
        return;
      }
      // Reset password fields после успеха — phone оставляем как есть.
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      addToast({ message: 'Пароль обновлён', tone: 'success' });
      setPasswordState('success');
    } catch {
      addToast({ message: 'Не удалось обновить пароль', tone: 'error' });
      setPasswordState('error');
    }
  }

  return (
    <section
      data-testid="account-credentials-section"
      className="rounded-card border border-line bg-panel p-5 sm:p-6"
    >
      <header className="flex flex-col gap-1 border-b border-line pb-4">
        <p className="font-body text-[11px] font-bold uppercase tracking-[0.18em] text-muted">
          Account credentials
        </p>
        <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
          Учётные данные
        </h2>
        <p className="text-sm leading-relaxed text-muted">
          Email и имя в этой фазе не редактируются. Поменять можно телефон и пароль — оба обновятся
          сразу для текущей сессии.
        </p>
      </header>

      <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            Email
          </dt>
          <dd className="mt-1 text-sm text-ink">{user.email}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Имя</dt>
          <dd className="mt-1 text-sm text-ink">{user.name}</dd>
        </div>
      </dl>

      {/* Phone form */}
      <form className="mt-6 flex flex-col gap-2" onSubmit={handlePhoneSubmit}>
        <label
          htmlFor={phoneFieldId}
          className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted"
        >
          Телефон
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id={phoneFieldId}
            data-testid="account-phone-input"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(event) => {
              setPhone(event.target.value);
              setPhoneError(null);
              setPhoneState('idle');
            }}
            placeholder="+7 (900) 123-45-67"
            className="flex-1 rounded-card border border-line bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-lime focus:outline-none"
          />
          <Button
            type="submit"
            disabled={submitsDisabled || phoneState === 'submitting'}
            className="sm:w-auto"
          >
            {phoneState === 'submitting' ? 'Сохраняем…' : 'Сохранить телефон'}
          </Button>
        </div>
        {phoneError ? (
          <p data-testid="account-phone-error" className="text-xs text-red">
            {phoneError}
          </p>
        ) : null}
      </form>

      {/* Password form */}
      <form
        className="mt-6 flex flex-col gap-3 border-t border-line pt-5"
        onSubmit={handlePasswordSubmit}
      >
        <h3 className="font-display text-base font-semibold text-ink">Сменить пароль</h3>

        <div className="flex flex-col gap-2">
          <label
            htmlFor={currentPwdId}
            className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted"
          >
            Текущий пароль
          </label>
          <div className="flex items-center gap-2">
            <input
              id={currentPwdId}
              data-testid="account-current-password"
              type={showCurrent ? 'text' : 'password'}
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => {
                setCurrentPassword(event.target.value);
                setCurrentPasswordError(null);
              }}
              className="flex-1 rounded-card border border-line bg-canvas px-3 py-2 text-sm text-ink focus:border-lime focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowCurrent((s) => !s)}
              className="rounded-pill border border-line bg-panel px-3 py-1.5 text-xs font-semibold text-muted hover:border-lime hover:text-lime"
              aria-label={showCurrent ? 'Скрыть пароль' : 'Показать пароль'}
            >
              {showCurrent ? 'Скрыть' : 'Показать'}
            </button>
          </div>
          {currentPasswordError ? (
            <p data-testid="account-current-password-error" className="text-xs text-red">
              {currentPasswordError}
            </p>
          ) : null}
        </div>

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
              data-testid="account-new-password"
              type={showNew ? 'text' : 'password'}
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => {
                setNewPassword(event.target.value);
                setPasswordError(null);
              }}
              className="flex-1 rounded-card border border-line bg-canvas px-3 py-2 text-sm text-ink focus:border-lime focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowNew((s) => !s)}
              className="rounded-pill border border-line bg-panel px-3 py-1.5 text-xs font-semibold text-muted hover:border-lime hover:text-lime"
              aria-label={showNew ? 'Скрыть пароль' : 'Показать пароль'}
            >
              {showNew ? 'Скрыть' : 'Показать'}
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
            data-testid="account-confirm-password"
            type={showNew ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => {
              setConfirmPassword(event.target.value);
              setPasswordError(null);
            }}
            className="rounded-card border border-line bg-canvas px-3 py-2 text-sm text-ink focus:border-lime focus:outline-none"
          />
        </div>

        {passwordError ? (
          <p data-testid="account-password-error" className="text-xs text-red">
            {passwordError}
          </p>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Button
            type="submit"
            disabled={submitsDisabled || passwordState === 'submitting'}
            className="sm:w-auto"
          >
            {passwordState === 'submitting' ? 'Сохраняем…' : 'Сменить пароль'}
          </Button>
        </div>
      </form>
    </section>
  );
}
