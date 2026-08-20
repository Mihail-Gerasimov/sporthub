// Недоступная база отвечает отказом, а не пятисоткой.
//
// Разница не косметическая. Пятисотка означает «в коде дефект», и мониторинг с фронтом
// обязаны отличать её от «база лежит»: в первом случае чинят код, во втором ждут базу.
// Наружу при этом не должно уходить ничего про устройство хранилища — ни адреса,
// ни порта, ни имени схемы, ни слова про клиента базы.

import { Catch, type ArgumentsHost } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { DomainErrorFilter } from './domain-error.filter';

/** Минимальный ответ Express: фильтру нужны только статус и тело. */
function fakeResponse() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });

  return {
    json,
    status,
    host: {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as unknown as ArgumentsHost,
  };
}

describe('Ответ при недоступной базе', () => {
  const filter = new DomainErrorFilter();

  it('код ошибки Prisma переводится в отказ обслуживания', () => {
    const response = fakeResponse();
    const error = Object.assign(new Error("Can't reach database server"), { code: 'P1001' });

    filter.catch(error, response.host);

    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      error: 'База данных недоступна',
    });
  });

  it('обрыв соединения на уровне сети — тоже отказ обслуживания', () => {
    const response = fakeResponse();

    filter.catch(new Error('connect ECONNREFUSED 127.0.0.1:5434'), response.host);

    expect(response.status).toHaveBeenCalledWith(503);
  });

  it('наружу не уходит ничего про устройство хранилища', () => {
    const response = fakeResponse();

    filter.catch(new Error('connect ECONNREFUSED 127.0.0.1:5434'), response.host);

    const body = JSON.stringify(response.json.mock.calls[0][0]);

    for (const secret of ['5434', '127.0.0.1', 'prisma', 'postgres', 'public']) {
      expect(body.toLowerCase()).not.toContain(secret);
    }
  });

  it('обычная ошибка кода по-прежнему пятисотка', () => {
    const response = fakeResponse();

    filter.catch(new Error('что-то пошло не так'), response.host);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      error: 'Внутренняя ошибка сервера',
    });
  });
});
