// Транзакции поверх Prisma и доступ к клиенту базы для репозиториев.
//
// Приём тот же, что и в файловом хранилище, и это не совпадение, а условие переезда.
//
// Сложность в том, что Prisma требует выполнять запросы транзакции на ОТДЕЛЬНОМ клиенте,
// который она выдаёт колбэку. Пробросить его через все 66 методов репозиториев значило бы
// переписать каждый из них и каждый вызов — а заодно навсегда закрепить в контракте
// репозитория знание о том, что транзакции вообще существуют.
//
// Поэтому клиент кладётся в контекст выполнения: сервис оборачивает работу
// в `runInTransaction`, а репозитории просто спрашивают «какой сейчас клиент» и получают
// транзакционный. Ровно так же файловое хранилище держало буфер записи.
//
// ⚠️ Вложенные транзакции Prisma не поддерживает вовсе. А вложенные вызовы у нас есть:
// смена статуса записи вызывается изнутри отмены, публикация — из обёртки. Наивный перенос
// дал бы взаимную блокировку: внутренняя транзакция ждала бы соединения из пула, которое
// держит внешняя. Поэтому вложенный вызов ПРИСОЕДИНЯЕТСЯ к уже открытой транзакции.

import { AsyncLocalStorage } from 'node:async_hooks';

import { Injectable } from '@nestjs/common';

import type { PrismaClient } from './prisma-client/client';
import { PrismaService } from './prisma.service';
import type { TransactionRunner } from './transaction-runner';

/**
 * Клиент, на котором репозитории делают запросы.
 *
 * Это тот же клиент Prisma без методов управления соединением и транзакциями:
 * внутри транзакции их вызывать нельзя, и типы это отражают.
 */
export type DatabaseClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

/**
 * Сколько ждать транзакцию.
 *
 * Значения по умолчанию у Prisma — две секунды на получение соединения и пять
 * на саму работу. Каскадное удаление публикации трогает пять таблиц, и пять секунд
 * ему хватает с запасом; но пусть числа стоят явно, а не подразумеваются.
 */
const TRANSACTION_OPTIONS = { maxWait: 5_000, timeout: 15_000 };

/** Работа, которую нельзя делать до коммита. */
type AfterCommitTask = () => void | Promise<void>;

@Injectable()
export class PrismaTransactionRunner implements TransactionRunner {
  private readonly activeTransaction = new AsyncLocalStorage<DatabaseClient>();

  /**
   * Очередь побочных эффектов текущей транзакции.
   *
   * Уведомление, отправленное ДО коммита, невозможно отозвать: транзакция откатится,
   * записи не станет, а письмо о ней уже ушло. Поэтому такие действия копятся здесь
   * и выполняются после того, как база подтвердила запись.
   */
  private readonly afterCommitTasks = new AsyncLocalStorage<AfterCommitTask[]>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Отложить побочный эффект до коммита.
   *
   * Вне транзакции выполняется сразу — откатывать нечего.
   */
  async afterCommit(task: AfterCommitTask): Promise<void> {
    const queue = this.afterCommitTasks.getStore();

    if (!queue) {
      await task();

      return;
    }

    queue.push(task);
  }

  /**
   * Клиент для текущего запроса.
   *
   * Внутри транзакции — транзакционный, снаружи — обычный. Репозиторию разница
   * не видна, и это единственная причина, по которой их код не знает про транзакции.
   */
  get client(): DatabaseClient {
    return this.activeTransaction.getStore() ?? this.prisma.client;
  }

  async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    // Вложенный вызов присоединяется к внешней транзакции, а не открывает свою:
    // иначе внутренняя половина работы ушла бы в базу раньше внешней — а на Prisma
    // ещё и заблокировала бы саму себя, ожидая соединение, занятое внешней.
    if (this.activeTransaction.getStore()) {
      return work();
    }

    const tasks: AfterCommitTask[] = [];

    const result = await this.afterCommitTasks.run(tasks, () =>
      this.prisma.client.$transaction(
        (transaction) => this.activeTransaction.run(transaction, work),
        TRANSACTION_OPTIONS,
      ),
    );

    // Досюда доходим только при успешном коммите: откат бросает исключение выше.
    for (const task of tasks) {
      await task();
    }

    return result;
  }
}
