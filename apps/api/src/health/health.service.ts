// Сервис health-check. Вынесен отдельно от контроллера не ради самой логики
// (она тривиальна), а чтобы в каркасе с самого начала была проверяемая точка
// внедрения зависимостей: если метадата декораторов сломается, это будет видно.
import { Injectable } from '@nestjs/common';

export type HealthStatus = {
  status: 'ok';
  uptime: number;
  timestamp: string;
};

@Injectable()
export class HealthService {
  getStatus(): HealthStatus {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
