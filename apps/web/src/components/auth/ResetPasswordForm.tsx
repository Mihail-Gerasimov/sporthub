'use client';

// Форма смены пароля по ссылке из письма (шаг 34.73).
//
// Ссылка одноразовая и срочная, поэтому у формы три исхода, и все три показываются
// человеку прямо здесь: пароль сменён, ссылка негодна (истекла или уже сработала),
// ввод не прошёл проверку. Отдельного экрана «ссылка протухла» нет — отказ приходит
// от сервера с готовым текстом, и придумывать свой значило бы завести вторую
// формулировку той же причины.

import { useState } from 'react';
import Link from 'next/link';
import { z } from 'zod';

import { Button, Card, Input } from '@/components/ui';
import { useAuthStore } from '@/stores/useAuthStore';

const formSchema = z
  .object({
    // Тот же порог, что при регистрации: правило пароля одно на все входы.
    password: z.string().min(6, 'Пароль должен быть не короче 6 символов.'),
    repeat: z.string(),
  })
  .refine((value) => value.password === value.repeat, {
    message: 'Пароли не совпадают.',
    path: ['repeat'],
  });

type FormErrors = Partial<Record<'password' | 'repeat' | 'form', string>>;

export function ResetPasswordForm({ token }: { token: string }) {
  const logout = useAuthStore((state) => state.logout);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const validationResult = formSchema.safeParse({ password, repeat });

    if (!validationResult.success) {
      setErrors(
        validationResult.error.issues.reduce<FormErrors>((accumulator, issue) => {
          const field = issue.path[0];

          if (field === 'password' || field === 'repeat') {
            accumulator[field] = issue.message;
          }

          return accumulator;
        }, {}),
      );
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const json = await response.json();

      if (!response.ok || !json.success) {
        setErrors({ form: json.error ?? 'Не удалось сменить пароль' });
        setIsSubmitting(false);
        return;
      }

      // Сервер погасил ВСЕ сессии этого человека, включая ту, что могла быть
      // открыта в этом браузере. Не почистить состояние здесь — значит показывать
      // «вы вошли» ровно до первого запроса, который ответит отказом.
      await logout();

      setIsDone(true);
      setIsSubmitting(false);
    } catch {
      setErrors({ form: 'Сетевая ошибка, попробуй позже' });
      setIsSubmitting(false);
    }
  }

  if (token === '') {
    return (
      <Card className="space-y-4 p-6">
        <h1 className="t-h3 text-ink">Ссылка неполная</h1>
        <p className="text-sm text-muted">
          В адресе нет значения ссылки. Открой письмо ещё раз и перейди по ссылке целиком — почтовые
          программы иногда переносят её на две строки.
        </p>
        <Link
          href="/"
          className="inline-flex min-h-12 w-full items-center justify-center rounded-full border border-line bg-panel px-5 text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent-strong"
        >
          На главную
        </Link>
      </Card>
    );
  }

  if (isDone) {
    return (
      <Card className="space-y-4 p-6">
        <h1 className="t-h3 text-ink">Пароль изменён</h1>
        <p className="text-sm text-muted">
          Прежние входы на всех устройствах отключены — так и задумано: если доступ к аккаунту
          увели, смена пароля обязана выставить чужого сразу. Войди заново с новым паролем.
        </p>
        <Link
          href="/"
          className="inline-flex min-h-12 w-full items-center justify-center rounded-full border border-transparent bg-accent px-5 text-sm font-semibold text-ink transition-colors hover:bg-accent-strong"
        >
          На главную
        </Link>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <form noValidate className="space-y-5" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <h1 className="t-h3 text-ink">Новый пароль</h1>
          <p className="text-sm text-muted">
            Придумай пароль и подтверди его. После смены все прежние входы отключатся.
          </p>
        </div>

        <div className="grid gap-4">
          <Input
            label="Новый пароль"
            type="password"
            placeholder="Минимум 6 символов"
            value={password}
            error={errors.password}
            disabled={isSubmitting}
            onChange={(event) => {
              setPassword(event.target.value);
              setErrors((current) => ({ ...current, password: undefined, form: undefined }));
            }}
          />
          <Input
            label="Повтори пароль"
            type="password"
            placeholder="Ещё раз"
            value={repeat}
            error={errors.repeat}
            disabled={isSubmitting}
            onChange={(event) => {
              setRepeat(event.target.value);
              setErrors((current) => ({ ...current, repeat: undefined, form: undefined }));
            }}
          />
        </div>

        {errors.form ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {errors.form}
          </p>
        ) : null}

        <Button fullWidth type="submit" loading={isSubmitting}>
          Сменить пароль
        </Button>
      </form>
    </Card>
  );
}
