// Phase 26 Step 26.7: POST /api/auth/login — fake-auth по email без проверки
// пароля (MVP). Все пользователи лежат в users.json. Логика:
//   (1) ищем user.email (case-sensitive), status='active';
//   (2) admin → 403 (входит через /service-portal, не через AuthModal);
//   (3) сверяем accountType (UI: athlete|provider) с user.role (DB:
//       athlete|club_owner|trainer|admin). Несоответствие → 403.
//   (4) успех → 200 c sanitized user (без password).
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getUsers } from '@/lib/db';

const loginSchema = z
  .object({
    email: z.string().email('Некорректный email'),
    accountType: z.enum(['athlete', 'provider']),
    // password принимаем для совместимости с будущей формой, но не проверяем.
    password: z.string().optional(),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const raw = await request.json();
    const validation = loginSchema.safeParse(raw);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Некорректные данные запроса' },
        { status: 400 },
      );
    }

    const { email, accountType } = validation.data;

    const users = await getUsers();
    const user = users.find((u) => u.email === email && u.status === 'active');

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Пользователь не найден' },
        { status: 404 },
      );
    }

    if (user.role === 'admin') {
      return NextResponse.json(
        { success: false, error: 'Администраторы входят через /service-portal' },
        { status: 403 },
      );
    }

    // accountType=athlete требует role=athlete; accountType=provider — club_owner|trainer.
    const matchesType =
      accountType === 'athlete'
        ? user.role === 'athlete'
        : user.role === 'club_owner' || user.role === 'trainer';

    if (!matchesType) {
      return NextResponse.json(
        { success: false, error: 'Неверный тип кабинета для этого email' },
        { status: 403 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        avatarUrl: user.avatarUrl,
        city: user.city,
      },
    });
  } catch (error) {
    console.error('Ошибка POST /api/auth/login:', error);
    return NextResponse.json(
      { success: false, error: 'Ошибка обработки запроса' },
      { status: 500 },
    );
  }
}
