'use client';

import { useId, useState } from 'react';
import { z } from 'zod';

import { AUTH_ACCOUNT_TYPE_OPTIONS, DEFAULT_CITY } from '@/lib/constants';
import { formatPhone } from '@/lib/utils';
import type { AuthAccountType } from '@/types';

import { Button, Chip, Input, Modal } from '@/components/ui';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';

type AuthTab = 'login' | 'register';

type LoginFormState = {
  email: string;
  password: string;
};

type RegisterFormState = {
  name: string;
  email: string;
  phone: string;
  password: string;
};

type LoginFormErrors = Partial<Record<keyof LoginFormState, string>>;
type RegisterFormErrors = Partial<Record<keyof RegisterFormState, string>>;

const DEFAULT_LOGIN_FORM: LoginFormState = {
  email: '',
  password: '',
};

const DEFAULT_REGISTER_FORM: RegisterFormState = {
  name: '',
  email: '',
  phone: '',
  password: '',
};

const DEFAULT_LOGIN_ERRORS: LoginFormErrors = {};
const DEFAULT_REGISTER_ERRORS: RegisterFormErrors = {};

const loginFormSchema = z.object({
  email: z.email('Укажи корректный email.'),
  password: z.string().min(6, 'Пароль должен быть не короче 6 символов.'),
});

const registerFormSchema = z.object({
  name: z.string().trim().min(1, 'Укажи имя.'),
  email: z.email('Укажи корректный email.'),
  phone: z.string().refine((value) => getNormalizedRussianPhoneDigits(value) !== null, {
    message: 'Укажи телефон в формате +7 (999) 000-00-00.',
  }),
  password: z.string().min(6, 'Пароль должен быть не короче 6 символов.'),
});

type AccountTypeSelectorProps = {
  selectedAccountType: AuthAccountType | null;
  onSelect: (value: AuthAccountType) => void;
};

function AccountTypeSelector({ onSelect, selectedAccountType }: AccountTypeSelectorProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-ink">Тип аккаунта</p>
      <div className="flex flex-wrap gap-2">
        {AUTH_ACCOUNT_TYPE_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            active={selectedAccountType === option.value}
            onClick={() => {
              onSelect(option.value);
            }}
          >
            {option.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function getLoginValidationErrors(form: LoginFormState): LoginFormErrors {
  const validationResult = loginFormSchema.safeParse(form);

  if (validationResult.success) {
    return DEFAULT_LOGIN_ERRORS;
  }

  return validationResult.error.issues.reduce<LoginFormErrors>((accumulator, issue) => {
    const fieldName = issue.path[0];

    if (fieldName === 'email' || fieldName === 'password') {
      accumulator[fieldName] = issue.message;
    }

    return accumulator;
  }, {});
}

function getNormalizedRussianPhoneDigits(value: string): string | null {
  const digits = value.replace(/\D/g, '');

  if (digits.length === 10) {
    return `7${digits}`;
  }

  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    return `7${digits.slice(1)}`;
  }

  return null;
}

function maskRussianPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, '');

  if (digits.length === 0) {
    return '';
  }

  let normalizedDigits = digits;

  if (digits.startsWith('8')) {
    normalizedDigits = `7${digits.slice(1)}`;
  } else if (!digits.startsWith('7')) {
    normalizedDigits = `7${digits}`;
  }

  normalizedDigits = normalizedDigits.slice(0, 11);

  const countryCode = normalizedDigits.slice(0, 1);
  const areaCode = normalizedDigits.slice(1, 4);
  const firstPart = normalizedDigits.slice(4, 7);
  const secondPart = normalizedDigits.slice(7, 9);
  const thirdPart = normalizedDigits.slice(9, 11);

  let maskedValue = `+${countryCode}`;

  if (areaCode) {
    maskedValue += ` (${areaCode}`;
  }

  if (areaCode.length === 3) {
    maskedValue += ')';
  }

  if (firstPart) {
    maskedValue += ` ${firstPart}`;
  }

  if (secondPart) {
    maskedValue += `-${secondPart}`;
  }

  if (thirdPart) {
    maskedValue += `-${thirdPart}`;
  }

  return maskedValue;
}

function getRegisterValidationErrors(form: RegisterFormState): RegisterFormErrors {
  const validationResult = registerFormSchema.safeParse(form);

  if (validationResult.success) {
    return DEFAULT_REGISTER_ERRORS;
  }

  return validationResult.error.issues.reduce<RegisterFormErrors>((accumulator, issue) => {
    const fieldName = issue.path[0];

    if (
      fieldName === 'name' ||
      fieldName === 'email' ||
      fieldName === 'phone' ||
      fieldName === 'password'
    ) {
      accumulator[fieldName] = issue.message;
    }

    return accumulator;
  }, {});
}

/** Кнопка-иконка переключения видимости пароля */
function PasswordToggle({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'}
      className="text-muted transition-colors hover:text-ink"
      onClick={onClick}
    >
      {visible ? (
        /* Иконка «глаз перечёркнутый» — пароль виден, нажми чтобы скрыть */
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
          <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      ) : (
        /* Иконка «глаз» — пароль скрыт, нажми чтобы показать */
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
  );
}

export function AuthModal() {
  const isAuthModalOpen = useUIStore((state) => state.isAuthModalOpen);
  const closeAuthModal = useUIStore((state) => state.closeAuthModal);
  const login = useAuthStore((state) => state.login);
  const register = useAuthStore((state) => state.register);
  const [activeTab, setActiveTab] = useState<AuthTab>('login');
  const [loginAccountType, setLoginAccountType] = useState<AuthAccountType | null>(null);
  const [registerAccountType, setRegisterAccountType] = useState<AuthAccountType | null>(null);
  const [loginForm, setLoginForm] = useState<LoginFormState>(DEFAULT_LOGIN_FORM);
  const [loginErrors, setLoginErrors] = useState<LoginFormErrors>(DEFAULT_LOGIN_ERRORS);
  const [isLoginSubmitting, setIsLoginSubmitting] = useState(false);
  const [registerForm, setRegisterForm] = useState<RegisterFormState>(DEFAULT_REGISTER_FORM);
  const [registerErrors, setRegisterErrors] = useState<RegisterFormErrors>(DEFAULT_REGISTER_ERRORS);
  const [isRegisterSubmitting, setIsRegisterSubmitting] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const loginTabId = useId();
  const registerTabId = useId();
  const loginPanelId = useId();
  const registerPanelId = useId();
  function resetModalState() {
    setActiveTab('login');
    setLoginAccountType(null);
    setRegisterAccountType(null);
    setLoginForm(DEFAULT_LOGIN_FORM);
    setLoginErrors(DEFAULT_LOGIN_ERRORS);
    setIsLoginSubmitting(false);
    setRegisterForm(DEFAULT_REGISTER_FORM);
    setRegisterErrors(DEFAULT_REGISTER_ERRORS);
    setIsRegisterSubmitting(false);
    setShowLoginPassword(false);
    setShowRegisterPassword(false);
  }

  function handleCloseModal() {
    closeAuthModal();
    resetModalState();
  }

  // Phase 26 Step 26.7: fake-auth через fetch к /api/auth/login.
  // Сервер проверяет email в users.json и возвращает sanitized-user.
  async function handleLoginSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!loginAccountType || isLoginSubmitting) {
      return;
    }

    const normalizedLoginForm = {
      email: loginForm.email.trim(),
      password: loginForm.password,
    } satisfies LoginFormState;
    const validationErrors = getLoginValidationErrors(normalizedLoginForm);

    setLoginErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setIsLoginSubmitting(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: normalizedLoginForm.email,
          accountType: loginAccountType,
        }),
      });
      const json = await response.json();

      if (!response.ok || !json.success) {
        setLoginErrors({ email: json.error ?? 'Не удалось войти' });
        setIsLoginSubmitting(false);
        return;
      }

      login({
        accountType: loginAccountType,
        user: json.data,
      });
      handleCloseModal();
    } catch {
      setLoginErrors({ email: 'Сетевая ошибка, попробуй позже' });
      setIsLoginSubmitting(false);
    }
  }

  // Phase 26 Step 26.7: fake-auth регистрация через /api/auth/register.
  // Сервер пишет нового user в users.json через db.createUser.
  async function handleRegisterSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!registerAccountType || isRegisterSubmitting) {
      return;
    }

    const normalizedRegisterForm = {
      name: registerForm.name.trim(),
      email: registerForm.email.trim(),
      phone: registerForm.phone,
      password: registerForm.password,
    } satisfies RegisterFormState;
    const validationErrors = getRegisterValidationErrors(normalizedRegisterForm);

    setRegisterErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setIsRegisterSubmitting(true);

    try {
      const normalizedPhoneDigits = getNormalizedRussianPhoneDigits(normalizedRegisterForm.phone);
      const formattedPhone = normalizedPhoneDigits ? formatPhone(normalizedPhoneDigits) : '';

      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: normalizedRegisterForm.name,
          email: normalizedRegisterForm.email,
          phone: formattedPhone,
          password: normalizedRegisterForm.password,
          accountType: registerAccountType,
          city: DEFAULT_CITY,
        }),
      });
      const json = await response.json();

      if (!response.ok || !json.success) {
        // 409 — email занят; прочие — общее сообщение в поле email.
        const errorMessage =
          response.status === 409
            ? 'Email уже зарегистрирован'
            : (json.error ?? 'Не удалось создать аккаунт');
        setRegisterErrors({ email: errorMessage });
        setIsRegisterSubmitting(false);
        return;
      }

      register({
        accountType: registerAccountType,
        user: json.data,
      });
      handleCloseModal();
    } catch {
      setRegisterErrors({ email: 'Сетевая ошибка, попробуй позже' });
      setIsRegisterSubmitting(false);
    }
  }

  return (
    <Modal
      open={isAuthModalOpen}
      onClose={handleCloseModal}
      title="Войти или создать профиль"
      description="Выбери сценарий, тип аккаунта и продолжи работу с SportHub. Логика авторизации будет расширяться на следующих шагах."
    >
      <div className="space-y-6">
        <div
          role="tablist"
          aria-label="Сценарии авторизации"
          className="grid grid-cols-2 gap-2 rounded-card border border-line bg-canvas p-1"
        >
          <button
            id={loginTabId}
            role="tab"
            type="button"
            aria-controls={loginPanelId}
            aria-selected={activeTab === 'login'}
            className={`rounded-pill px-4 py-3 text-sm font-semibold transition-colors ${
              activeTab === 'login'
                ? 'bg-lime text-ink shadow-card'
                : 'text-ink hover:bg-panel hover:text-accent'
            }`}
            onClick={() => {
              setActiveTab('login');
            }}
          >
            Вход
          </button>
          <button
            id={registerTabId}
            role="tab"
            type="button"
            aria-controls={registerPanelId}
            aria-selected={activeTab === 'register'}
            className={`rounded-pill px-4 py-3 text-sm font-semibold transition-colors ${
              activeTab === 'register'
                ? 'bg-lime text-ink shadow-card'
                : 'text-ink hover:bg-panel hover:text-accent'
            }`}
            onClick={() => {
              setActiveTab('register');
            }}
          >
            Регистрация
          </button>
        </div>

        {activeTab === 'login' ? (
          <form
            id={loginPanelId}
            noValidate
            role="tabpanel"
            aria-labelledby={loginTabId}
            className="space-y-5"
            onSubmit={handleLoginSubmit}
          >
            <AccountTypeSelector
              selectedAccountType={loginAccountType}
              onSelect={setLoginAccountType}
            />

            <div className="grid gap-4">
              <Input
                label="Email"
                type="email"
                placeholder="name@example.com"
                value={loginForm.email}
                error={loginErrors.email}
                disabled={isLoginSubmitting}
                onChange={(event) => {
                  setLoginForm((currentValue) => ({
                    ...currentValue,
                    email: event.target.value,
                  }));
                  setLoginErrors((currentValue) => ({
                    ...currentValue,
                    email: undefined,
                  }));
                }}
              />
              <Input
                label="Пароль"
                type={showLoginPassword ? 'text' : 'password'}
                placeholder="Введите пароль"
                value={loginForm.password}
                error={loginErrors.password}
                disabled={isLoginSubmitting}
                endAdornment={
                  <PasswordToggle
                    visible={showLoginPassword}
                    onClick={() => {
                      setShowLoginPassword((v) => !v);
                    }}
                  />
                }
                onChange={(event) => {
                  setLoginForm((currentValue) => ({
                    ...currentValue,
                    password: event.target.value,
                  }));
                  setLoginErrors((currentValue) => ({
                    ...currentValue,
                    password: undefined,
                  }));
                }}
              />
            </div>

            <Button
              fullWidth
              type="submit"
              loading={isLoginSubmitting}
              disabled={!loginAccountType}
            >
              Продолжить вход
            </Button>
          </form>
        ) : (
          <form
            id={registerPanelId}
            noValidate
            role="tabpanel"
            aria-labelledby={registerTabId}
            className="space-y-5"
            onSubmit={handleRegisterSubmit}
          >
            <AccountTypeSelector
              selectedAccountType={registerAccountType}
              onSelect={setRegisterAccountType}
            />

            <div className="grid gap-4">
              <Input
                label="Имя"
                placeholder="Как к тебе обращаться"
                value={registerForm.name}
                error={registerErrors.name}
                disabled={isRegisterSubmitting}
                onChange={(event) => {
                  setRegisterForm((currentValue) => ({
                    ...currentValue,
                    name: event.target.value,
                  }));
                  setRegisterErrors((currentValue) => ({
                    ...currentValue,
                    name: undefined,
                  }));
                }}
              />
              <Input
                label="Email"
                type="email"
                placeholder="name@example.com"
                value={registerForm.email}
                error={registerErrors.email}
                disabled={isRegisterSubmitting}
                onChange={(event) => {
                  setRegisterForm((currentValue) => ({
                    ...currentValue,
                    email: event.target.value,
                  }));
                  setRegisterErrors((currentValue) => ({
                    ...currentValue,
                    email: undefined,
                  }));
                }}
              />
              <Input
                label="Телефон"
                placeholder="+7 (999) 000-00-00"
                value={registerForm.phone}
                error={registerErrors.phone}
                disabled={isRegisterSubmitting}
                onChange={(event) => {
                  setRegisterForm((currentValue) => ({
                    ...currentValue,
                    phone: maskRussianPhoneInput(event.target.value),
                  }));
                  setRegisterErrors((currentValue) => ({
                    ...currentValue,
                    phone: undefined,
                  }));
                }}
              />
              <Input
                label="Пароль"
                type={showRegisterPassword ? 'text' : 'password'}
                placeholder="Минимум 6 символов"
                value={registerForm.password}
                error={registerErrors.password}
                disabled={isRegisterSubmitting}
                endAdornment={
                  <PasswordToggle
                    visible={showRegisterPassword}
                    onClick={() => {
                      setShowRegisterPassword((v) => !v);
                    }}
                  />
                }
                onChange={(event) => {
                  setRegisterForm((currentValue) => ({
                    ...currentValue,
                    password: event.target.value,
                  }));
                  setRegisterErrors((currentValue) => ({
                    ...currentValue,
                    password: undefined,
                  }));
                }}
              />
            </div>

            <Button
              fullWidth
              type="submit"
              loading={isRegisterSubmitting}
              disabled={!registerAccountType}
            >
              Создать аккаунт
            </Button>
          </form>
        )}
      </div>
    </Modal>
  );
}
