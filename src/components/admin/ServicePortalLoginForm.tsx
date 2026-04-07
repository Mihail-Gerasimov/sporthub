/**
 * Форма фейк-входа в admin-панель (/service-portal).
 * Проверяет email против admin seed-пользователя (id=3).
 * При совпадении — вызывает adminLogin() и redirect на dashboard.
 */
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { z } from 'zod';

import { Button, Input } from '@/components/ui';
import { MVP_ADMIN_USER_ID, useAuthStore } from '@/stores/useAuthStore';

// Email admin seed-пользователя для фейк-валидации
const ADMIN_SEED_EMAIL = 'admin@sporthub.local';
const AUTH_SUBMIT_DELAY_MS = 600;

const loginSchema = z.object({
  email: z.string().email('Укажи корректный email.'),
  password: z.string().min(6, 'Пароль должен быть не короче 6 символов.'),
});

type LoginFormState = {
  email: string;
  password: string;
};

type LoginFormErrors = Partial<Record<keyof LoginFormState | 'general', string>>;

export function ServicePortalLoginForm() {
  const router = useRouter();
  const adminLogin = useAuthStore((s) => s.adminLogin);

  const [form, setForm] = useState<LoginFormState>({ email: '', password: '' });
  const [errors, setErrors] = useState<LoginFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleChange(field: keyof LoginFormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined, general: undefined }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Валидация формы через Zod
    const result = loginSchema.safeParse(form);

    if (!result.success) {
      const fieldErrors: LoginFormErrors = {};

      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof LoginFormState;

        if (!fieldErrors[field]) {
          fieldErrors[field] = issue.message;
        }
      }

      setErrors(fieldErrors);
      return;
    }

    // Проверка что email совпадает с admin seed
    if (form.email.toLowerCase() !== ADMIN_SEED_EMAIL) {
      setErrors({ general: 'Нет доступа. Этот email не зарегистрирован как администратор.' });
      return;
    }

    // Fake-вход с задержкой (аналог AuthModal)
    setIsSubmitting(true);

    setTimeout(() => {
      adminLogin({
        id: MVP_ADMIN_USER_ID,
        name: 'Администратор SportHub',
        email: ADMIN_SEED_EMAIL,
      });

      setIsSubmitting(false);
      router.push('/service-portal/dashboard');
    }, AUTH_SUBMIT_DELAY_MS);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <Input
        label="Email"
        type="email"
        placeholder="admin@sporthub.local"
        value={form.email}
        onChange={(e) => handleChange('email', e.target.value)}
        error={errors.email}
      />

      <Input
        label="Пароль"
        type="password"
        placeholder="Введите пароль"
        value={form.password}
        onChange={(e) => handleChange('password', e.target.value)}
        error={errors.password}
      />

      {errors.general ? <p className="text-sm font-medium text-danger">{errors.general}</p> : null}

      <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
        {isSubmitting ? 'Проверяем…' : 'Войти'}
      </Button>
    </form>
  );
}
