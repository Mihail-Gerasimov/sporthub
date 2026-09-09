// Health-check: проверка живости сервиса под pm2 и мониторингом.
// Отвечает в общем контракте проекта — { success: true, data }, том же, что
// у всех 39 роутов, которые предстоит перенести.
import { Controller, Get } from '@nestjs/common';

import { Public } from '../auth/access.decorators';
import { HealthService, type HealthStatus } from './health.service';

// Пометка стоит на классе: у контроллера единственный маршрут, и он обязан
// отвечать вообще всем. Проверку живости дёргают pm2 и мониторинг — у них
// нет и не может быть сессии, а требование входа превратило бы 401 в «сервис жив»
// и наоборот: падение авторизации выглядело бы как падение всего сервиса.
@Public()
@Controller('health')
export class HealthController {
  // public — чтобы тест мог убедиться, что сюда пришёл реальный экземпляр
  // сервиса, а не undefined от пустой метадаты.
  constructor(public readonly healthService: HealthService) {}

  @Get()
  check(): Promise<HealthStatus> {
    // Обёртку `{ success, data }` добавляет общий интерцептор — контроллеры
    // возвращают только полезную нагрузку.
    return this.healthService.getStatus();
  }
}
