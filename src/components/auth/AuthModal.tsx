'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { z } from 'zod';

import { AUTH_ACCOUNT_TYPE_OPTIONS } from '@/lib/constants';
import { formatPhone } from '@/lib/utils';
import type { AuthAccountType } from '@/types';

import { Button, Chip, Input, Modal } from '@/components/ui';
import { MVP_ATHLETE_USER_ID, useAuthStore, type AuthSessionUser } from '@/stores/useAuthStore';
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
const AUTH_SUBMIT_DELAY_MS = 600;

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

function createLoginSessionUser(email: string, accountType: AuthAccountType): AuthSessionUser {
  const [localPart] = email.split('@');

  return {
    id: accountType === 'athlete' ? MVP_ATHLETE_USER_ID : undefined,
    name: localPart || 'sporthub-user',
    email,
  };
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

function createRegisterSessionUser(
  form: RegisterFormState,
  accountType: AuthAccountType,
): AuthSessionUser {
  const normalizedPhoneDigits = getNormalizedRussianPhoneDigits(form.phone);

  return {
    id: accountType === 'athlete' ? MVP_ATHLETE_USER_ID : undefined,
    name: form.name.trim(),
    email: form.email.trim(),
    phone: normalizedPhoneDigits ? formatPhone(normalizedPhoneDigits) : undefined,
  };
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
  const loginTabId = useId();
  const registerTabId = useId();
  const loginPanelId = useId();
  const registerPanelId = useId();
  const submitTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (submitTimeoutRef.current !== null) {
        window.clearTimeout(submitTimeoutRef.current);
      }
    };
  }, []);

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

    if (submitTimeoutRef.current !== null) {
      window.clearTimeout(submitTimeoutRef.current);
      submitTimeoutRef.current = null;
    }
  }

  function handleCloseModal() {
    closeAuthModal();
    resetModalState();
  }

  function handleLoginSubmit(event: React.FormEvent<HTMLFormElement>) {
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

    submitTimeoutRef.current = window.setTimeout(() => {
      login({
        accountType: loginAccountType,
        user: createLoginSessionUser(normalizedLoginForm.email, loginAccountType),
      });
      handleCloseModal();
    }, AUTH_SUBMIT_DELAY_MS);
  }

  function handleRegisterSubmit(event: React.FormEvent<HTMLFormElement>) {
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

    submitTimeoutRef.current = window.setTimeout(() => {
      register({
        accountType: registerAccountType,
        user: createRegisterSessionUser(normalizedRegisterForm, registerAccountType),
      });
      handleCloseModal();
    }, AUTH_SUBMIT_DELAY_MS);
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
                ? 'bg-ink text-panel shadow-card'
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
                ? 'bg-ink text-panel shadow-card'
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
                type="password"
                placeholder="Введите пароль"
                value={loginForm.password}
                error={loginErrors.password}
                disabled={isLoginSubmitting}
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
                type="password"
                placeholder="Минимум 6 символов"
                value={registerForm.password}
                error={registerErrors.password}
                disabled={isRegisterSubmitting}
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
