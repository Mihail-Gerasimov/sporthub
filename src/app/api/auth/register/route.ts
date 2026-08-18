// Phase 26 Step 26.7: POST /api/auth/register — создание user через db.createUser.
// Password plaintext в users.json (MVP-fake auth; файл в .gitignore). Mapping
// accountType → role: athlete → 'athlete'; provider → 'club_owner' (при
// регистрации UI всегда club_owner, тренер появляется только через seed).
// 409 если email уже используется — проверка на уровне роута до createUser.
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createUser, getUsers } from '@/lib/db';
import type { UserRole } from '@sporthub/types';

const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Имя минимум 2 символа'),
    email: z.string().email('Некорректный email'),
    password: z.string().min(6, 'Пароль минимум 6 символов'),
    phone: z.string().optional(),
    city: z.string().optional(),
    accountType: z.enum(['athlete', 'provider']),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const raw = await request.json();
    const validation = registerSchema.safeParse(raw);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Некорректные данные регистрации' },
        { status: 400 },
      );
    }

    const { name, email, password, phone, city, accountType } = validation.data;

    const users = await getUsers();
    if (users.some((u) => u.email === email)) {
      return NextResponse.json(
        { success: false, error: 'Email уже зарегистрирован' },
        { status: 409 },
      );
    }

    const role: UserRole = accountType === 'athlete' ? 'athlete' : 'club_owner';

    const created = await createUser({
      role,
      status: 'active',
      name,
      email,
      phone: phone ?? '',
      password,
      avatarUrl: '',
      favoriteClubIds: [],
      city,
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          id: created.id,
          name: created.name,
          email: created.email,
          phone: created.phone,
          city: created.city,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Ошибка POST /api/auth/register:', error);
    return NextResponse.json(
      { success: false, error: 'Ошибка обработки запроса' },
      { status: 500 },
    );
  }
}
