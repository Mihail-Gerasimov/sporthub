// Вход и регистрация.
//
// ⚠️ Пароль при входе НЕ проверяется — маршрут пускает по одному лишь адресу
// почты. Поле принимается ради совместимости формы и игнорируется. Это
// сознательно перенесённая дыра: фаза сохраняет поведение, настоящая проверка
// будет отдельной фазой. Пароль при регистрации сохраняется открытым текстом.

import { Body, Controller, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import type { User, UserRole } from '@sporthub/types';
import { z } from 'zod';

import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../common/domain-error';
import type { UsersRepository } from '../repositories/crud.repository';
import { USERS_REPOSITORY } from '../repositories/crud.repository';

const loginSchema = z
  .object({
    email: z.string().email('Некорректный email'),
    accountType: z.enum(['athlete', 'provider']),
    password: z.string().optional(),
  })
  .strict();

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

/** Публичная карточка пользователя — ровно те поля, что отдавались раньше. */
export type AuthUser = {
  id: number;
  name: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
  city?: string;
};

@Controller('auth')
export class AuthController {
  constructor(@Inject(USERS_REPOSITORY) private readonly users: UsersRepository) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() rawBody: unknown): Promise<AuthUser> {
    const parsed = loginSchema.safeParse(rawBody);

    if (!parsed.success) {
      throw new ValidationError('Некорректные данные запроса');
    }

    const { email, accountType } = parsed.data;
    const all = await this.users.findAll();
    const user = all.find(
      (candidate) => candidate.email === email && candidate.status === 'active',
    );

    if (!user) {
      throw new NotFoundError('Пользователь не найден');
    }

    if (user.role === 'admin') {
      throw new ForbiddenError('Администраторы входят через /service-portal');
    }

    const matchesType =
      accountType === 'athlete'
        ? user.role === 'athlete'
        : user.role === 'club_owner' || user.role === 'trainer';

    if (!matchesType) {
      throw new ForbiddenError('Неверный тип кабинета для этого email');
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      city: user.city,
    };
  }

  @Post('register')
  async register(@Body() rawBody: unknown): Promise<AuthUser> {
    const parsed = registerSchema.safeParse(rawBody);

    if (!parsed.success) {
      throw new ValidationError('Некорректные данные регистрации');
    }

    const { name, email, password, phone, city, accountType } = parsed.data;
    const existing = await this.users.findByEmail(email);

    if (existing) {
      throw new ConflictError('Email уже зарегистрирован');
    }

    // Регистрация провайдера всегда создаёт владельца клуба:
    // тренер как роль появляется только в исходных данных.
    const role: UserRole = accountType === 'athlete' ? 'athlete' : 'club_owner';

    const created = await this.users.insert({
      role,
      status: 'active',
      name,
      email,
      phone: phone ?? '',
      password,
      avatarUrl: '',
      favoriteClubIds: [],
      city,
    } as Omit<User, 'id' | 'createdAt'>);

    return {
      id: created.id,
      name: created.name,
      email: created.email,
      phone: created.phone,
      city: created.city,
    };
  }
}

export const AUTH_CONTROLLERS = [AuthController];
