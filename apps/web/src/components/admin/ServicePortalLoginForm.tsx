/**
 * Вход в сервисную панель.
 *
 * ⚠️ До фазы 34 форма НЕ ХОДИЛА НА СЕРВЕР ВОВСЕ: она сверяла введённую почту
 * с константой в бандле, собирала администратора из литералов и объявляла вход
 * состоявшимся. Пароль не проверялся ничем — подходил любой из шести символов,
 * и почта администратора лежала в исходниках страницы, доступной кому угодно.
 *
 * Теперь тот же путь, что и у обычного входа: пароль сверяет бэкенд, сессию
 * ставит он же (httpOnly cookie), а роль форма не назначает — она СПРАШИВАЕТ её
 * ответом «кто я». Признак администратора приходит с сервера или не приходит
 * вовсе; собрать его на клиенте больше нечем.
 */
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { z } from 'zod';

import { Button, Input } from '@/components/ui';
import { useAuthStore } from '@/stores/useAuthStore';

/**
 * Ответ на неудачную попытку — один на все случаи.
 *
 * Разные тексты («нет такой почты» против «неверный пароль») превращают форму
 * входа в перечислитель учёток: не зная ни одного пароля, можно узнать, какие
 * адреса заведены. Бэкенд по той же причине отвечает одинаково, и здесь этот
 * ответ не расширяется подробностями.
 */
const LOGIN_FAILED = 'Неверная почта или пароль.';

/** Отказ по роли: пароль верный, но эта учётка не для сервисной панели. */
const NOT_AN_ADMIN = 'У этой учётной записи нет доступа к сервисной панели.';

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
  const loadSession = useAuthStore((s) => s.loadSession);

  const [form, setForm] = useState<LoginFormState>({ email: '', password: '' });
  const [errors, setErrors] = useState<LoginFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleChange(field: keyof LoginFormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined, general: undefined }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

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

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // Тип кабинета — «админ»: сервисная панель это отдельный вход, и решает,
        // пускать ли по нему, сервер. Личность в теле не передаётся: её здесь
        // и нет — есть только то, что человек ввёл сам.
        body: JSON.stringify({
          email: result.data.email,
          password: result.data.password,
          accountType: 'admin',
        }),
      });

      if (!response.ok) {
        setErrors({ general: LOGIN_FAILED });
        return;
      }

      // Кто именно вошёл — спрашиваем у сервера. Ответ входа роли не содержит,
      // а собирать её из введённой почты означало бы вернуть прежнюю дыру.
      await loadSession();

      const session = useAuthStore.getState();

      if (session.role !== 'admin') {
        setErrors({ general: NOT_AN_ADMIN });
        return;
      }

      // Стор уже наполнен `loadSession`; отдельный вызов нужен, чтобы админский
      // трек (признак панели, сброс имперсонизации) включался одним понятным
      // действием, а не собирался по полям в трёх местах.
      adminLogin(session.user ?? { name: '', email: result.data.email });

      // Phase 30.1 (final): обычный router.push() без router.refresh().
      // refresh() в dev-mode отменял начатый push (гонка с RSC-кэшем).
      router.push('/service-portal/dashboard');
    } catch {
      setErrors({ general: 'Сетевая ошибка, попробуй позже.' });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
      className="flex flex-col gap-5"
    >
      <Input
        label="Email"
        type="email"
        placeholder="Введите email"
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
