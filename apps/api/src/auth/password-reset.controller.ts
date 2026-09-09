// Восстановление пароля: два публичных маршрута.
//
// Отдельным контроллером, а не строками в `auth.controller.ts`: там живёт вход,
// и у него свой набор правил (сверка пароля, тип кабинета, блокировка попыток).
// Смешивать их значило бы читать оба набора всякий раз, когда правится один.
// Префикс общий (`/api/auth/...`), потому что для клиента это тот же домен.
//
// ⚠️ Оба маршрута публичны по определению: к ним приходит человек, который войти
// НЕ может. Именно поэтому оба стоят под ограничением частоты — открытая дверь
// без счётчика становится и перечислителем адресов, и способом занять процессор
// расчётом хешей.

import { Body, Controller, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';

import { EMPTY_RESULT, type EmptyResult } from '../common/api-response';
import { ValidationError } from '../common/domain-error';
import { RateLimit } from '../common/rate-limit';
import { Public } from './access.decorators';
import { PasswordResetService } from './password-reset.service';
import { clearSessionCookie } from './session-cookie';

const forgotSchema = z.object({ email: z.string().email('Некорректный email') }).strict();

const resetSchema = z
  .object({
    // Длина не проверяется: значение выдаём мы сами, и «слишком короткое» здесь
    // означало бы не ошибку ввода, а негодную ссылку — а это уже ответ сервиса.
    token: z.string().min(1, 'Ссылка восстановления не указана'),
    // Тот же порог, что и при регистрации: правило пароля одно на все входы,
    // иначе через восстановление можно было бы поставить пароль слабее.
    password: z.string().min(6, 'Пароль минимум 6 символов'),
  })
  .strict();

@Controller('auth')
export class PasswordResetController {
  constructor(private readonly passwordReset: PasswordResetService) {}

  /**
   * Заявка на восстановление.
   *
   * ⚠️ Ответ ОДИНАКОВ для существующей и несуществующей почты — и по коду, и по телу.
   * Контроллер о существовании пользователя не знает вовсе: сервис ему этого
   * не сообщает. Так «одинаковый ответ» держится устройством кода, а не тем, что
   * кто-то не забыл написать одинаковые ветки.
   */
  @Public()
  @RateLimit('passwordReset')
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgot(@Body() rawBody: unknown): Promise<EmptyResult> {
    const parsed = forgotSchema.safeParse(rawBody);

    if (!parsed.success) {
      throw new ValidationError('Некорректные данные запроса');
    }

    await this.passwordReset.request({ email: parsed.data.email, now: new Date() });

    return EMPTY_RESULT;
  }

  /**
   * Сброс пароля по ссылке из письма.
   *
   * Cookie сессии очищается вместе со сбросом: все сессии пользователя гаснут
   * на сервере, и оставить браузеру мёртвый идентификатор — значит показать ему
   * «вы вошли» ровно до первого запроса, который ответит 401.
   */
  @Public()
  @RateLimit('passwordReset')
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async reset(
    @Body() rawBody: unknown,
    @Res({ passthrough: true }) response: Response,
  ): Promise<EmptyResult> {
    const parsed = resetSchema.safeParse(rawBody);

    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Некорректные данные запроса');
    }

    await this.passwordReset.reset({
      token: parsed.data.token,
      password: parsed.data.password,
      now: new Date(),
    });

    clearSessionCookie(response);

    return EMPTY_RESULT;
  }
}

export const PASSWORD_RESET_CONTROLLERS = [PasswordResetController];
