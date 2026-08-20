// Проверка живости сервиса.
//
// До фазы 33 она отвечала «всё хорошо» всегда: смотрела только на сам процесс.
// Это ровно тот случай, из-за которого сломанный сервис доживает до боевого
// сервера — мониторинг видит код 200, а страницы пустые. Теперь проверка
// спрашивает хранилище, отвечает ли оно, и говорит правду.
//
// ⚠️ Спрашивает через токен, а не через клиент базы напрямую: проверке живости
// нужен ответ «да или нет», и знать про базу ей незачем.

import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';

import { STORAGE_HEALTH, type StorageHealth } from '../storage/storage-health';

export type HealthStatus = {
  status: 'ok';
  /** Состояние хранилища. Поле новое: раньше о нём было нечего сказать. */
  database: 'up';
  uptime: number;
  timestamp: string;
};

@Injectable()
export class HealthService {
  constructor(@Inject(STORAGE_HEALTH) private readonly storage: StorageHealth) {}

  async getStatus(): Promise<HealthStatus> {
    const alive = await this.storage.isAlive();

    if (!alive) {
      // Отказ, а не «всё хорошо, но данных нет»: мониторинг обязан увидеть сбой,
      // а не догадываться о нём по пустым страницам.
      throw new ServiceUnavailableException('Хранилище недоступно');
    }

    return {
      status: 'ok',
      database: 'up',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
