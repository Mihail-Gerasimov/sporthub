// Тесты каркаса бэкенда: поднимаем реальный модуль Nest и бьём HTTP-запросом,
// а не мокаем контроллер.
//
// Второй тест — про метадату декораторов, и он здесь не для галочки. Nest строит
// DI из типов конструктора, которые компилятор кладёт в метадату по флагу
// `emitDecoratorMetadata`. Если её нет, контейнер собирается пустым и в поле
// приходит undefined — тест ответа это поймает не всегда, тест на instanceof поймает.
//
// Проверено диверсией 18.08.2026: снятие флага в apps/api/tsconfig.json роняет
// 2 из 3 кейсов. Плагин unplugin-swc при этом НЕ нужен — Vitest 4 транспилирует
// через oxc, а тот читает флаг из tsconfig и эмитит метадату сам.

import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../app.module";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";

describe("Каркас apps/api", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health отвечает 200 в контракте проекта { success, data }", async () => {
    const response = await request(app.getHttpServer()).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { status: "ok" },
    });
    expect(typeof response.body.data.uptime).toBe("number");
  });

  it("внедрение зависимостей работает: контроллер получил реальный сервис", () => {
    const controller = moduleRef.get(HealthController);
    const service = moduleRef.get(HealthService);

    // Если метадата декораторов не эмитится, Nest не сможет сопоставить
    // тип параметра конструктора с провайдером — сюда придёт undefined.
    expect(controller.healthService).toBeDefined();
    expect(controller.healthService).toBeInstanceOf(HealthService);
    expect(controller.healthService).toBe(service);
  });

  it("сервис отдаёт статус ok и неотрицательный uptime", () => {
    const service = moduleRef.get(HealthService);
    const status = service.getStatus();

    expect(status.status).toBe("ok");
    expect(status.uptime).toBeGreaterThanOrEqual(0);
    expect(() => new Date(status.timestamp).toISOString()).not.toThrow();
  });
});
