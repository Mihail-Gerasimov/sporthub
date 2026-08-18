// Валидация входа схемой Zod.
//
// Схемы остаются схемами Zod: их 41 объявление, и переписывать их на декораторы
// было бы работой без выгоды. Pipe лишь применяет схему и превращает отказ
// в доменную ошибку с тем же текстом, что отдавал прежний роут.

import type { ArgumentMetadata, PipeTransform } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { ZodType } from 'zod';

import { ValidationError } from './domain-error';

export type ZodPipeOptions = {
  /** Текст, который уйдёт наружу при отказе. */
  message: string;
  /** Отдавать ли разбор по полям — только там, где так было раньше. */
  withDetails?: boolean;
  /**
   * Брать текст из первой ошибки схемы вместо фиксированного.
   * Так вели себя смена пароля и прокси карт.
   */
  useIssueMessage?: boolean;
};

@Injectable()
export class ZodValidationPipe<TOutput> implements PipeTransform {
  constructor(
    private readonly schema: ZodType<TOutput>,
    private readonly options: ZodPipeOptions,
  ) {}

  transform(value: unknown, _metadata: ArgumentMetadata): TOutput {
    const result = this.schema.safeParse(value);

    if (result.success) {
      return result.data;
    }

    const message = this.options.useIssueMessage
      ? (result.error.issues[0]?.message ?? this.options.message)
      : this.options.message;

    const details = this.options.withDetails
      ? (result.error.flatten().fieldErrors as Record<string, string[] | undefined>)
      : undefined;

    throw new ValidationError(message, details);
  }
}
