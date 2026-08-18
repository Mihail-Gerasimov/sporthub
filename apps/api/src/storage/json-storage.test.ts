// Тесты слоя хранилища. Это фундамент всего бэкенда: поверх него лягут
// репозитории, а в следующей фазе — Prisma. Проверяем ровно то, что обязано
// сохраниться при смене реализации: формат файла на диске (байт в байт, иначе
// боевые данные превратятся в один гигантский diff), правила выдачи id
// и атомарность многоколлекционной записи.

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { JsonStorage } from "./json-storage";

describe("JsonStorage", () => {
  let dataDirectory: string;
  let storage: JsonStorage;

  beforeEach(async () => {
    dataDirectory = await mkdtemp(path.join(tmpdir(), "sporthub-storage-"));
    storage = new JsonStorage(dataDirectory);
    // Пустые коллекции, с которыми работают тесты ниже.
    await writeFile(path.join(dataDirectory, "clubs.json"), "[]\n", "utf8");
    await writeFile(path.join(dataDirectory, "trainers.json"), "[]\n", "utf8");
  });

  afterEach(async () => {
    await rm(dataDirectory, { force: true, recursive: true });
  });

  describe("чтение и запись", () => {
    it("записанное читается обратно без потерь", async () => {
      const clubs = [
        { id: 1, createdAt: "2026-01-01T00:00:00.000Z", name: "Первый" },
      ];
      await storage.write("clubs", clubs as never);

      expect(await storage.read("clubs")).toEqual(clubs);
    });

    it("формат файла — отступ 2 и завершающий перевод строки", async () => {
      await storage.write("clubs", [{ id: 1, name: "Первый" }] as never);
      const raw = await readFile(
        path.join(dataDirectory, "clubs.json"),
        "utf8",
      );

      // Побайтовое сравнение: любой другой отступ переписал бы весь боевой файл.
      expect(raw).toBe('[\n  {\n    "id": 1,\n    "name": "Первый"\n  }\n]\n');
    });

    it("кириллица не экранируется", async () => {
      await storage.write("clubs", [{ id: 1, name: "Самара" }] as never);
      const raw = await readFile(
        path.join(dataDirectory, "clubs.json"),
        "utf8",
      );

      expect(raw).toContain('"Самара"');
    });
  });

  describe("getNextEntityId", () => {
    it("пустая коллекция — первый id равен 1", () => {
      expect(storage.getNextEntityId([])).toBe(1);
    });

    it("непустая коллекция — максимальный id плюс один", () => {
      expect(storage.getNextEntityId([{ id: 3 }, { id: 7 }, { id: 5 }])).toBe(
        8,
      );
    });

    it("дыры в нумерации не переиспользуются", () => {
      expect(storage.getNextEntityId([{ id: 1 }, { id: 99 }])).toBe(100);
    });
  });

  describe("runInTransaction", () => {
    it("успешная работа коммитит все затронутые коллекции", async () => {
      await storage.runInTransaction(async (tx) => {
        await tx.write("clubs", [{ id: 1, name: "Клуб" }] as never);
        await tx.write("trainers", [{ id: 1, name: "Тренер" }] as never);
      });

      expect(await storage.read("clubs")).toHaveLength(1);
      expect(await storage.read("trainers")).toHaveLength(1);
    });

    it("до коммита файлы на диске не меняются", async () => {
      await storage.runInTransaction(async (tx) => {
        await tx.write("clubs", [{ id: 1, name: "Клуб" }] as never);
        // Внутри транзакции диск ещё чист — запись отложена до коммита.
        expect(await storage.read("clubs")).toEqual([]);
      });

      expect(await storage.read("clubs")).toHaveLength(1);
    });

    it("ошибка внутри работы не оставляет частичной записи", async () => {
      await expect(
        storage.runInTransaction(async (tx) => {
          await tx.write("clubs", [{ id: 1, name: "Клуб" }] as never);
          throw new Error("Сбой бизнес-логики");
        }),
      ).rejects.toThrow("Сбой бизнес-логики");

      expect(await storage.read("clubs")).toEqual([]);
    });

    it("сбой записи второй коллекции откатывает первую", async () => {
      // Диверсионный хук: имитируем падение файловой системы на второй записи.
      let writes = 0;
      storage.setWriteFailureHookForTests(() => {
        writes += 1;
        if (writes === 2) throw new Error("Сбой записи на диск");
      });

      await expect(
        storage.runInTransaction(async (tx) => {
          await tx.write("clubs", [{ id: 1, name: "Клуб" }] as never);
          await tx.write("trainers", [{ id: 1, name: "Тренер" }] as never);
        }),
      ).rejects.toThrow("Сбой записи на диск");

      // Обе коллекции должны остаться в исходном состоянии.
      expect(await storage.read("clubs")).toEqual([]);
      expect(await storage.read("trainers")).toEqual([]);
    });

    it("читает внутри транзакции уже записанное в ней самой", async () => {
      const seen = await storage.runInTransaction(async (tx) => {
        await tx.write("clubs", [{ id: 1, name: "Клуб" }] as never);
        return tx.read("clubs");
      });

      expect(seen).toHaveLength(1);
    });
  });
});
