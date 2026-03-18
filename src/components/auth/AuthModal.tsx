'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { z } from 'zod';

import { AUTH_ACCOUNT_TYPE_OPTIONS } from '@/lib/constants';
import type { AuthAccountType } from '@/types';

import { Button, Chip, Input, Modal } from '@/components/ui';
import { useAuthStore, type AuthSessionUser } from '@/stores/useAuthStore';
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
const AUTH_LOGIN_DELAY_MS = 600;

const loginFormSchema = z.object({
  email: z.email('Укажи корректный email.'),
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

function createLoginSessionUser(email: string): AuthSessionUser {
  const [localPart] = email.split('@');

  return {
    name: localPart || 'sporthub-user',
    email,
  };
}

export function AuthModal() {
  const isAuthModalOpen = useUIStore((state) => state.isAuthModalOpen);
  const closeAuthModal = useUIStore((state) => state.closeAuthModal);
  const login = useAuthStore((state) => state.login);
  const [activeTab, setActiveTab] = useState<AuthTab>('login');
  const [loginAccountType, setLoginAccountType] = useState<AuthAccountType | null>(null);
  const [registerAccountType, setRegisterAccountType] = useState<AuthAccountType | null>(null);
  const [loginForm, setLoginForm] = useState<LoginFormState>(DEFAULT_LOGIN_FORM);
  const [loginErrors, setLoginErrors] = useState<LoginFormErrors>(DEFAULT_LOGIN_ERRORS);
  const [isLoginSubmitting, setIsLoginSubmitting] = useState(false);
  const [registerForm, setRegisterForm] = useState<RegisterFormState>(DEFAULT_REGISTER_FORM);
  const loginTabId = useId();
  const registerTabId = useId();
  const loginPanelId = useId();
  const registerPanelId = useId();
  const loginTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (loginTimeoutRef.current !== null) {
        window.clearTimeout(loginTimeoutRef.current);
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

    if (loginTimeoutRef.current !== null) {
      window.clearTimeout(loginTimeoutRef.current);
      loginTimeoutRef.current = null;
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

    loginTimeoutRef.current = window.setTimeout(() => {
      login({
        accountType: loginAccountType,
        user: createLoginSessionUser(normalizedLoginForm.email),
      });
      handleCloseModal();
    }, AUTH_LOGIN_DELAY_MS);
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
          <section
            id={registerPanelId}
            role="tabpanel"
            aria-labelledby={registerTabId}
            className="space-y-5"
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
                onChange={(event) => {
                  setRegisterForm((currentValue) => ({
                    ...currentValue,
                    name: event.target.value,
                  }));
                }}
              />
              <Input
                label="Email"
                type="email"
                placeholder="name@example.com"
                value={registerForm.email}
                onChange={(event) => {
                  setRegisterForm((currentValue) => ({
                    ...currentValue,
                    email: event.target.value,
                  }));
                }}
              />
              <Input
                label="Телефон"
                placeholder="+7 (999) 000-00-00"
                value={registerForm.phone}
                onChange={(event) => {
                  setRegisterForm((currentValue) => ({
                    ...currentValue,
                    phone: event.target.value,
                  }));
                }}
              />
              <Input
                label="Пароль"
                type="password"
                placeholder="Минимум 6 символов"
                value={registerForm.password}
                onChange={(event) => {
                  setRegisterForm((currentValue) => ({
                    ...currentValue,
                    password: event.target.value,
                  }));
                }}
              />
            </div>

            <Button fullWidth type="button" disabled={!registerAccountType}>
              Создать аккаунт
            </Button>
          </section>
        )}
      </div>
    </Modal>
  );
}
