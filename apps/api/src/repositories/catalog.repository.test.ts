// Тесты репозиториев связей, услуг и уведомлений.
// Проверяем то, что обязано пережить смену хранилища: фильтры, порядок выдачи,
// пагинацию, дословные тексты ошибок и правило «пустая правка не пишет файл».

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { JsonStorage } from "../storage/json-storage";
import {
  JsonNotificationsRepository,
  JsonOfferingsRepository,
  JsonTrainerClubLinksRepository,
} from "./catalog.repository";

describe("Репозитории каталога", () => {
  let dataDirectory: string;
  let storage: JsonStorage;

  beforeEach(async () => {
    dataDirectory = await mkdtemp(path.join(tmpdir(), "sporthub-catalog-"));
    storage = new JsonStorage(dataDirectory);
    for (const file of [
      "trainer-club-links.json",
      "offerings.json",
      "notifications.json",
    ]) {
      await writeFile(path.join(dataDirectory, file), "[]\n", "utf8");
    }
  });

  afterEach(async () => {
    await rm(dataDirectory, { force: true, recursive: true });
  });

  describe("TrainerClubLinksRepository", () => {
    const link = {
      trainerId: 1,
      clubId: 1,
      status: "pending",
      initiatedBy: "trainer",
    } as const;

    it("фильтрует по тренеру, клубу и статусу", async () => {
      const links = new JsonTrainerClubLinksRepository(storage);
      await links.insert({ ...link });
      await links.insert({ ...link, trainerId: 2, status: "confirmed" });

      expect(await links.findMany({ trainerId: 1 })).toHaveLength(1);
      expect(await links.findMany({ status: "confirmed" })).toHaveLength(1);
      expect(
        await links.findMany({ trainerId: 1, status: "confirmed" }),
      ).toHaveLength(0);
      expect(await links.findMany()).toHaveLength(2);
    });

    it("обновление несуществующей связи бросает дословный текст со стрелкой", async () => {
      const links = new JsonTrainerClubLinksRepository(storage);

      // Символ «↔» в тексте — на него завязан существующий тест проекта.
      await expect(links.update(999, { status: "confirmed" })).rejects.toThrow(
        "Привязка тренер↔клуб не найдена",
      );
    });

    it("обновление проставляет переданные поля", async () => {
      const links = new JsonTrainerClubLinksRepository(storage);
      const created = await links.insert({ ...link });

      const updated = await links.update(created.id, {
        status: "confirmed",
        approvedByUserId: 2,
      });

      expect(updated.status).toBe("confirmed");
      expect(updated.approvedByUserId).toBe(2);
    });
  });

  describe("OfferingsRepository", () => {
    const offering = {
      ownerType: "club",
      ownerId: 1,
      sportId: 1,
      title: "Тренировка",
      description: "Описание",
      format: "group",
      price: 1000,
      durationMinutes: 60,
      capacity: 10,
      address: "ул. Ленина, 1",
      coordinates: { lat: 53.2, lng: 50.1 },
    } as const;

    it("фильтрует по владельцу, findFirst отдаёт первую услугу", async () => {
      const offerings = new JsonOfferingsRepository(storage);
      await offerings.insert({ ...offering });
      await offerings.insert({ ...offering, title: "Вторая" });
      await offerings.insert({ ...offering, ownerType: "trainer", ownerId: 5 });

      expect(
        await offerings.findMany({ ownerType: "club", ownerId: 1 }),
      ).toHaveLength(2);
      const first = await offerings.findFirst({
        ownerType: "club",
        ownerId: 1,
      });
      expect(first?.title).toBe("Тренировка");
    });

    it("массовая правка снимает привязку к разорванной связи", async () => {
      const offerings = new JsonOfferingsRepository(storage);
      const a = await offerings.insert({ ...offering, trainerClubLinkId: 7 });
      const b = await offerings.insert({ ...offering, trainerClubLinkId: 7 });
      await offerings.insert({ ...offering, trainerClubLinkId: 8 });

      const byLink = await offerings.findByLinkId(7);
      expect(byLink.map((item) => item.id)).toEqual([a.id, b.id]);

      const updated = await offerings.updateMany(
        byLink.map((item) => item.id),
        { trainerClubLinkId: undefined },
      );

      expect(updated).toBe(2);
      expect(await offerings.findByLinkId(7)).toHaveLength(0);
      expect(await offerings.findByLinkId(8)).toHaveLength(1);
    });

    it("пустой список идентификаторов — операция без эффекта", async () => {
      const offerings = new JsonOfferingsRepository(storage);
      await offerings.insert({ ...offering });

      expect(await offerings.updateMany([], { price: 1 })).toBe(0);
      expect(await offerings.removeMany([])).toBe(0);
      expect(await offerings.findAll()).toHaveLength(1);
    });
  });

  describe("NotificationsRepository", () => {
    const base = { userId: 1, type: "booking_confirmed", payload: {} } as const;

    it("свежие уведомления идут первыми", async () => {
      const notifications = new JsonNotificationsRepository(storage);
      await notifications.insert({ ...base, payload: { n: 1 } });
      await notifications.insert({ ...base, payload: { n: 2 } });

      const found = await notifications.findMany({ userId: 1 });

      expect(found[0].payload).toEqual({ n: 2 });
    });

    it("фильтр непрочитанных и подсчёт согласованы", async () => {
      const notifications = new JsonNotificationsRepository(storage);
      const first = await notifications.insert({ ...base });
      await notifications.insert({ ...base });
      await notifications.markRead(first.id);

      expect(
        await notifications.findMany({ userId: 1, unreadOnly: true }),
      ).toHaveLength(1);
      expect(await notifications.count({ userId: 1, unreadOnly: true })).toBe(
        1,
      );
      expect(await notifications.count({ userId: 1 })).toBe(2);
    });

    it("пагинация режет отсортированный список", async () => {
      const notifications = new JsonNotificationsRepository(storage);
      for (let index = 0; index < 5; index += 1) {
        await notifications.insert({ ...base, payload: { index } });
      }

      const page = await notifications.findMany({
        userId: 1,
        offset: 1,
        limit: 2,
      });

      expect(page).toHaveLength(2);
    });

    it("пометка несуществующего бросает дословный текст", async () => {
      const notifications = new JsonNotificationsRepository(storage);

      await expect(notifications.markRead(999)).rejects.toThrow(
        "Уведомление не найдено",
      );
    });

    it("markAllRead без непрочитанных не трогает файл", async () => {
      const notifications = new JsonNotificationsRepository(storage);
      const filePath = path.join(dataDirectory, "notifications.json");
      const before = await readFile(filePath, "utf8");

      const updated = await notifications.markAllRead(1);

      expect(updated).toBe(0);
      // Как в db.ts: нулевая правка вообще не доходит до диска.
      expect(await readFile(filePath, "utf8")).toBe(before);
    });

    it("удаление считает только реально удалённое", async () => {
      const notifications = new JsonNotificationsRepository(storage);
      const first = await notifications.insert({ ...base });

      expect(await notifications.removeMany([first.id, 999])).toBe(1);
      expect(await notifications.findMany({ userId: 1 })).toHaveLength(0);
    });
  });
});
