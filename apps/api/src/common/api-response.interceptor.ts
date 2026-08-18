// Интерцептор, собирающий ответ в общую форму проекта.
// Контроллеры возвращают данные, а не готовый HTTP-ответ.

import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import type { Observable } from "rxjs";
import { map } from "rxjs/operators";

import { EMPTY_RESULT, TopLevelResult } from "./api-response";

@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(
      map((result: unknown) => {
        if (result === EMPTY_RESULT) {
          return { success: true };
        }

        if (result instanceof TopLevelResult) {
          return { success: true, data: result.data, ...result.extra };
        }

        return { success: true, data: result };
      }),
    );
  }
}
