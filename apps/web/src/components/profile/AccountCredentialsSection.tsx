/**
 * Phase 29 fix: единый блок «Учётные данные» для ЛК атлета и провайдера.
 *
 * Объединяет read-only данные профиля (тип кабинета, email, имя, телефон-display)
 * и формы редактирования (телефон inline, пароль через collapsible-панель).
 * Заменяет старые блоки «Базовые настройки» из AthleteFeedbackSettingsSection /
 * ProviderSettingsSection, которые дублировали те же поля и содержали плашку
 * «Редактирование появится позже» — теперь редактирование есть.
 *
 * Стилизация — `.claude/skills/frontend-design/SKILL.md`:
 * - rounded-[18px] карточка с border-line на bg-card-2;
 * - eyebrow Account · Профиль (body 700 11px) + display «Учётные данные»;
 * - mobile-first, минимальные отступы (gap-3 / p-4 sm:p-5);
 * - email/тип кабинета — `font-mono` для технических значений;
 * - кнопки rounded-full, без теней.
 *
 * Импер сонация: при `isImpersonating === true` блок заменяется на
 * orange-плашку «Изменения недоступны» — для смены пароля под impersonated
 * сессией есть отдельный admin-инструмент в DashboardPage.
 */
'use client';

import { useId, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui';
import { useAuthStore, type AuthSessionUser } from '@/stores/useAuthStore';
import { useToastStore } from '@/stores/useToastStore';

const PHONE_REGEX = /^\+7\s?\(?\d{3}\)?\s?\d{3}[-\s]?\d{2}[-\s]?\d{2}$/;

interface AccountCredentialsSectionProps {
  user: AuthSessionUser & { id?: number };
  /** Подпись для строки «Тип кабинета» (например, «Кабинет спортсмена»). */
  accountTitle: string;
}

type SubmitState = 'idle' | 'submitting';

export function AccountCredentialsSection({ user, accountTitle }: AccountCredentialsSectionProps) {
  const isImpersonating = useAuthStore((state) => state.isImpersonating);
  const updateAuthUser = useAuthStore((state) => state.updateUser);
  const addToast = useToastStore((state) => state.addToast);

  const phoneId = useId();
  const currentPwdId = useId();
  const newPwdId = useId();
  const confirmPwdId = useId();

  // Phone form
  const [phone, setPhone] = useState(user.phone ?? '');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [phoneState, setPhoneState] = useState<SubmitState>('idle');

  // Password form (collapsible)
  const [passwordOpen, setPasswordOpen] = useState(false);
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
        className="rounded-[18px] border border-orange/40 bg-orange/10 p-4 text-sm leading-relaxed text-orange-text sm:p-5"
      >
        <p className="font-display text-[14px] font-semibold uppercase tracking-wide">
          Изменения недоступны
        </p>
        <p className="mt-1.5 text-ink/90">
          Вы вошли как администратор. Изменение настроек этого пользователя возможно только из
          админ-панели.
        </p>
      </section>
    );
  }

  const userId = user.id;
  const submitsDisabled = userId === undefined;

  function resetPasswordFields() {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError(null);
    setCurrentPasswordError(null);
    setShowCurrent(false);
    setShowNew(false);
  }

  function closePasswordPanel() {
    setPasswordOpen(false);
    resetPasswordFields();
  }

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
        // ⚠️ Номер в адресе — ЧЬЮ учётку правят; сервер сверяет его с сессией
        // и чужую не отдаст. Одноимённого поля в теле больше нет: раньше «своё»
        // определялось совпадением двух чисел, которые оба присылал клиент.
        body: JSON.stringify({ phone: trimmed }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        addToast({ message: body?.error ?? 'Не удалось обновить телефон', tone: 'error' });
        return;
      }
      updateAuthUser({ phone: trimmed });
      addToast({ message: 'Телефон обновлён', tone: 'success' });
    } catch {
      addToast({ message: 'Не удалось обновить телефон', tone: 'error' });
    } finally {
      setPhoneState('idle');
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
        body: JSON.stringify({ password: newPassword, currentPassword }),
      });
      if (response.status === 401) {
        setCurrentPasswordError('Неверный текущий пароль');
        addToast({ message: 'Неверный текущий пароль', tone: 'error' });
        return;
      }
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        addToast({ message: body?.error ?? 'Не удалось обновить пароль', tone: 'error' });
        return;
      }
      addToast({ message: 'Пароль обновлён', tone: 'success' });
      // Свернули панель — поля сбросились через closePasswordPanel.
      closePasswordPanel();
    } catch {
      addToast({ message: 'Не удалось обновить пароль', tone: 'error' });
    } finally {
      setPasswordState('idle');
    }
  }

  return (
    <section
      data-testid="account-credentials-section"
      className="rounded-[18px] border border-line bg-card p-4 sm:p-5"
    >
      <header className="flex flex-col gap-1">
        <p className="font-body text-[11px] font-bold uppercase tracking-[0.18em] text-muted">
          Account · профиль
        </p>
        <h2 className="font-display text-[20px] uppercase leading-none tracking-tight text-ink sm:text-[22px]">
          Учётные данные
        </h2>
      </header>

      {/* Read-only сводка профиля + inline-редактируемый телефон. */}
      <dl className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <Field label="Тип кабинета" value={accountTitle} />
        <Field label="Email для входа" value={user.email} mono />
        <Field label="Имя" value={user.name} />
      </dl>

      {/* Phone: inline-редактирование (input + Save). */}
      <form
        className="mt-3 flex flex-col gap-2 rounded-[12px] border border-line bg-card-2 p-3"
        onSubmit={handlePhoneSubmit}
      >
        <label
          htmlFor={phoneId}
          className="font-body text-[10px] font-bold uppercase tracking-[0.16em] text-muted"
        >
          Телефон
        </label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            id={phoneId}
            data-testid="account-phone-input"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(event) => {
              setPhone(event.target.value);
              setPhoneError(null);
            }}
            placeholder="+7 (900) 123-45-67"
            className="flex-1 rounded-pill border border-line bg-bg px-3.5 py-2 font-mono text-[13px] text-ink placeholder:text-muted focus:border-lime focus:outline-none"
          />
          <Button
            type="submit"
            size="sm"
            disabled={submitsDisabled || phoneState === 'submitting'}
            className="sm:w-auto"
          >
            {phoneState === 'submitting' ? 'Сохраняем…' : 'Сохранить'}
          </Button>
        </div>
        {phoneError ? (
          <p data-testid="account-phone-error" className="font-body text-xs text-red">
            {phoneError}
          </p>
        ) : null}
      </form>

      {/* Password: collapsible. По умолчанию виден только trigger. */}
      <div className="mt-3 rounded-[12px] border border-line bg-card-2 p-3">
        {!passwordOpen ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-body text-[10px] font-bold uppercase tracking-[0.16em] text-muted">
                Пароль
              </p>
              <p className="mt-0.5 font-body text-xs text-muted">
                Раскройте форму, чтобы задать новый пароль.
              </p>
            </div>
            <button
              type="button"
              data-testid="account-password-trigger"
              onClick={() => setPasswordOpen(true)}
              disabled={submitsDisabled}
              className="rounded-pill border border-line bg-card px-3.5 py-1.5 font-body text-[11px] font-bold uppercase tracking-[0.14em] text-ink transition-colors hover:border-lime hover:text-lime-hov disabled:opacity-50"
            >
              Сменить пароль
            </button>
          </div>
        ) : (
          <form className="flex flex-col gap-2.5" onSubmit={handlePasswordSubmit}>
            <header className="flex items-center justify-between">
              <p className="font-body text-[10px] font-bold uppercase tracking-[0.16em] text-muted">
                Новый пароль
              </p>
              <button
                type="button"
                onClick={closePasswordPanel}
                disabled={passwordState === 'submitting'}
                className="rounded-pill border border-line bg-card px-2.5 py-1 font-body text-[10px] font-bold uppercase tracking-[0.14em] text-muted hover:border-orange hover:text-orange-text disabled:opacity-50"
              >
                Отмена
              </button>
            </header>

            <PasswordField
              id={currentPwdId}
              testId="account-current-password"
              autoComplete="current-password"
              label="Текущий"
              value={currentPassword}
              onChange={(value) => {
                setCurrentPassword(value);
                setCurrentPasswordError(null);
              }}
              show={showCurrent}
              onToggleShow={() => setShowCurrent((s) => !s)}
              error={currentPasswordError}
            />

            <PasswordField
              id={newPwdId}
              testId="account-new-password"
              autoComplete="new-password"
              label="Новый"
              value={newPassword}
              onChange={(value) => {
                setNewPassword(value);
                setPasswordError(null);
              }}
              show={showNew}
              onToggleShow={() => setShowNew((s) => !s)}
            />

            <PasswordField
              id={confirmPwdId}
              testId="account-confirm-password"
              autoComplete="new-password"
              label="Повторите"
              value={confirmPassword}
              onChange={(value) => {
                setConfirmPassword(value);
                setPasswordError(null);
              }}
              show={showNew}
              onToggleShow={() => setShowNew((s) => !s)}
              hideToggle
            />

            {passwordError ? (
              <p data-testid="account-password-error" className="font-body text-xs text-red">
                {passwordError}
              </p>
            ) : null}

            <div className="flex justify-end">
              <Button
                type="submit"
                size="sm"
                disabled={submitsDisabled || passwordState === 'submitting'}
                data-testid="account-password-submit"
              >
                {passwordState === 'submitting' ? 'Сохраняем…' : 'Сменить пароль'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

/* Read-only поле в grid профиля. */
function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="font-body text-[10px] font-bold uppercase tracking-[0.16em] text-muted">
        {label}
      </dt>
      <dd className={`mt-1 break-all text-[13px] text-ink ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}

/* Внутренний компонент: input + visibility toggle + label + опц. ошибка. */
function PasswordField({
  id,
  testId,
  autoComplete,
  label,
  value,
  onChange,
  show,
  onToggleShow,
  error,
  hideToggle = false,
}: {
  id: string;
  testId: string;
  autoComplete: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  show: boolean;
  onToggleShow: () => void;
  error?: string | null;
  hideToggle?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className="font-body text-[10px] font-bold uppercase tracking-[0.14em] text-muted"
      >
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          data-testid={testId}
          type={show ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="flex-1 rounded-pill border border-line bg-bg px-3.5 py-2 font-mono text-[13px] text-ink focus:border-lime focus:outline-none"
        />
        {!hideToggle ? (
          <button
            type="button"
            onClick={onToggleShow}
            className="rounded-pill border border-line bg-card px-2.5 py-1 font-body text-[10px] font-bold uppercase tracking-[0.14em] text-muted hover:border-lime hover:text-lime-hov"
            aria-label={show ? 'Скрыть пароль' : 'Показать пароль'}
          >
            {show ? 'Скрыть' : 'Показать'}
          </button>
        ) : null}
      </div>
      {error ? (
        <p data-testid={`${testId}-error`} className="font-body text-xs text-red">
          {error}
        </p>
      ) : null}
    </div>
  );
}
