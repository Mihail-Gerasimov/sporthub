// Тесты проверки источника запроса.
//
// Проверяется поведение, а не реализация: чтение проходит всегда, изменение
// с чужого сайта отбивается, своё — проходит, а отсутствие заголовков не мешает
// работать инструментам без браузера.

import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { checkRequestOrigin } from './origin-check';

type Call = { status?: number; body?: unknown; passed: boolean };

function run(method: string, headers: Record<string, string> = {}): Call {
  const call: Call = { passed: false };

  const request = { method, headers } as unknown as Request;
  const response = {
    status(code: number) {
      call.status = code;

      return this;
    },
    json(body: unknown) {
      call.body = body;

      return this;
    },
  } as unknown as Response;
  const next: NextFunction = vi.fn(() => {
    call.passed = true;
  }) as unknown as NextFunction;

  checkRequestOrigin(request, response, next);

  return call;
}

describe('Проверка источника запроса', () => {
  it('чтение пропускается всегда', () => {
    // У чтения нет последствий, и проверять его — значит ломать публичную выдачу.
    expect(run('GET', { 'sec-fetch-site': 'cross-site' }).passed).toBe(true);
  });

  it('изменение со своего сайта проходит', () => {
    expect(run('POST', { 'sec-fetch-site': 'same-origin' }).passed).toBe(true);
  });

  it('изменение с чужого сайта отбивается', () => {
    const call = run('POST', { 'sec-fetch-site': 'cross-site', origin: 'https://зло.example' });

    expect(call.passed).toBe(false);
    expect(call.status).toBe(403);
    expect(call.body).toEqual({ success: false, error: 'Запрос с чужого источника' });
  });

  it('удаление с чужого сайта тоже отбивается', () => {
    expect(run('DELETE', { 'sec-fetch-site': 'cross-site' }).status).toBe(403);
  });

  it('запрос без заголовков проходит', () => {
    // Это не браузер: curl, проверка живости контейнера, тесты. Опасен ЧУЖОЙ
    // источник, а не его отсутствие — межсайтовую подделку выполняет именно браузер,
    // и он заголовок ставит всегда.
    expect(run('POST').passed).toBe(true);
  });

  it('запрос, набранный в адресной строке, проходит', () => {
    expect(run('POST', { 'sec-fetch-site': 'none' }).passed).toBe(true);
  });

  // ⚠️ Найдено браузерным прогоном чек-листа (шаг 62): запрос с чужим `Origin`,
  // но БЕЗ признака `Sec-Fetch-Site`, доезжал до обработчика и создавал запись.
  // Причина — список разрешённых источников пуст по умолчанию, а значит проверка
  // по `Origin` выключена везде, где его никто не заполнил вручную. Заполнять
  // второй переменной то, что уже сказано публичным адресом, никто не станет:
  // забытая настройка — это не настройка, а выключенная защита.
  describe('запасной путь по Origin, когда браузер не прислал Sec-Fetch-Site', () => {
    it('чужой источник отбивается по публичному адресу площадки', () => {
      vi.stubEnv('SPORT_HUB_ALLOWED_ORIGINS', '');
      vi.stubEnv('SPORT_HUB_PUBLIC_ORIGIN', 'https://athletehub.ru');

      const call = run('POST', { origin: 'https://зло.example' });

      expect(call.passed).toBe(false);
      expect(call.status).toBe(403);

      vi.unstubAllEnvs();
    });

    it('свой публичный адрес проходит', () => {
      vi.stubEnv('SPORT_HUB_ALLOWED_ORIGINS', '');
      vi.stubEnv('SPORT_HUB_PUBLIC_ORIGIN', 'https://athletehub.ru');

      expect(run('POST', { origin: 'https://athletehub.ru' }).passed).toBe(true);

      vi.unstubAllEnvs();
    });

    it('явный список старше публичного адреса', () => {
      vi.stubEnv('SPORT_HUB_ALLOWED_ORIGINS', 'https://admin.athletehub.ru');
      vi.stubEnv('SPORT_HUB_PUBLIC_ORIGIN', 'https://athletehub.ru');

      expect(run('POST', { origin: 'https://admin.athletehub.ru' }).passed).toBe(true);
      expect(run('POST', { origin: 'https://athletehub.ru' }).status).toBe(403);

      vi.unstubAllEnvs();
    });
  });
});
