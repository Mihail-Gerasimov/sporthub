'use client';

import { useId, useState } from 'react';

import { AUTH_ACCOUNT_TYPE_OPTIONS } from '@/lib/constants';
import type { AuthAccountType } from '@/types';

import { Button, Chip, Input, Modal } from '@/components/ui';
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

export function AuthModal() {
  const isAuthModalOpen = useUIStore((state) => state.isAuthModalOpen);
  const closeAuthModal = useUIStore((state) => state.closeAuthModal);
  const [activeTab, setActiveTab] = useState<AuthTab>('login');
  const [loginAccountType, setLoginAccountType] = useState<AuthAccountType | null>(null);
  const [registerAccountType, setRegisterAccountType] = useState<AuthAccountType | null>(null);
  const [loginForm, setLoginForm] = useState<LoginFormState>({
    email: '',
    password: '',
  });
  const [registerForm, setRegisterForm] = useState<RegisterFormState>({
    name: '',
    email: '',
    phone: '',
    password: '',
  });
  const loginTabId = useId();
  const registerTabId = useId();
  const loginPanelId = useId();
  const registerPanelId = useId();

  return (
    <Modal
      open={isAuthModalOpen}
      onClose={closeAuthModal}
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
          <section
            id={loginPanelId}
            role="tabpanel"
            aria-labelledby={loginTabId}
            className="space-y-5"
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
                onChange={(event) => {
                  setLoginForm((currentValue) => ({
                    ...currentValue,
                    email: event.target.value,
                  }));
                }}
              />
              <Input
                label="Пароль"
                type="password"
                placeholder="Введите пароль"
                value={loginForm.password}
                onChange={(event) => {
                  setLoginForm((currentValue) => ({
                    ...currentValue,
                    password: event.target.value,
                  }));
                }}
              />
            </div>

            <Button fullWidth type="button" disabled={!loginAccountType}>
              Продолжить вход
            </Button>
          </section>
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
