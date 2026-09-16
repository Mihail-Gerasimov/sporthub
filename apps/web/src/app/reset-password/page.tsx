// Страница смены пароля по ссылке из письма (шаг 34.73).
//
// Серверная часть делает ровно одно: достаёт значение ссылки из адреса и отдаёт
// его форме. Сверять ссылку здесь нечем и незачем — решение принимает сервер
// в момент смены пароля, а предварительная проверка означала бы второе место,
// где живёт то же правило.

import type { Metadata } from 'next';
import { BRAND_NAME } from '@sporthub/domain';

import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';

export const metadata: Metadata = {
  title: `Смена пароля — ${BRAND_NAME}`,
};

// Значение ссылки приходит в адресе, поэтому страница не кэшируется.
export const dynamic = 'force-dynamic';

type ResetPasswordPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const params = await searchParams;
  const raw = params.token;
  // Повторный параметр в адресе даёт массив: берём первый, а не склеиваем —
  // склейка превратила бы негодную ссылку в непонятную ошибку.
  const token = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '');

  return (
    <main className="mx-auto w-full max-w-md px-4 py-10 sm:py-16">
      <ResetPasswordForm token={token} />
    </main>
  );
}
