// Разбор числового идентификатора из пути.
// Раньше эта проверка была скопирована в двенадцать мест, причём с шестью
// разными текстами ошибки. Текст остаётся параметром — он свой у каждого
// домена и уходит наружу дословно.

import type { PipeTransform } from '@nestjs/common';
import { Injectable } from '@nestjs/common';

import { ValidationError } from './domain-error';

@Injectable()
export class EntityIdPipe implements PipeTransform<string, number> {
  constructor(private readonly message: string) {}

  transform(value: string): number {
    const parsed = Number(value);

    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new ValidationError(this.message);
    }

    return parsed;
  }
}
