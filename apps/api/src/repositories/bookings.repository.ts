// Репозиторий записей на тренировки.
//
// Здесь только доступ к данным. Правила переходов живут в `@sporthub/domain`
// (чистые функции), а оркестрация — проверки, пересчёт мест, уведомления —
// в сервисе. Такое разделение и есть смысл фазы: репозиторий подменяется
// на Prisma-версию, а правила и сервис не трогаются.

import { compareByCreatedAtDesc } from '@sporthub/domain';
import type { Booking, BookingStatus } from '@sporthub/types';

import { sliceToPage } from './crud.repository';
import type { JsonStorage } from '../storage/json-storage';

export const BOOKINGS_REPOSITORY = Symbol('BOOKINGS_REPOSITORY');

/**
 * Порядок выдачи записей.
 *
 * - `id` — порядок появления. Это то, что отдавало файловое хранилище без всякой
 *   сортировки, и на нём стоит эталон контрактов: полный срез обязан прийти
 *   в том же порядке, что и раньше.
 * - `slotDate` — по дню занятия, вторым ключом момент записи. Так сортировал
 *   контроллер «моих записей» вручную, уже ПОСЛЕ чтения всей выдачи. С появлением
 *   постраничности сортировать после среза стало нельзя: порядок задаёт, какие
 *   строки вообще попадут на страницу, поэтому он уходит в запрос.
 */
export type BookingsOrder = 'id' | 'slotDate';

/**
 * Отбор записей. Все поля необязательные — и это главное свойство фильтра.
 *
 * ⚠️ До этого шага 14 страниц фронта тянули ПОЛНЫЙ срез записей платформы, чтобы
 * показать записи одного человека или одного клуба. Отбор по владельцу, атлету,
 * периоду и набору статусов плюс постраничность превращают такой запрос
 * в `WHERE` + `LIMIT/OFFSET`; необязательность полей нужна, чтобы прежние вызовы
 * (в том числе `?scope=all`) продолжали означать ровно то же, что означали.
 */
export interface BookingsFilter {
  userId?: number;
  scheduleId?: number;
  status?: BookingStatus | BookingStatus[];
  /**
   * Клуб записи: владелец-клуб ИЛИ клуб-площадка.
   *
   * Это не одно и то же поле: тренерское занятие в зале клуба принадлежит тренеру,
   * а клубом для него оказывается именно площадка. Владелец зала обязан видеть
   * такую запись, поэтому отбор покрывает оба случая — ровно как `getBookingClubId`.
   */
  clubId?: number;
  /** Тренер записи. */
  trainerId?: number;
  /** Нижняя граница дня занятия, включительно, строка `YYYY-MM-DD`. */
  dateFrom?: string;
  /** Верхняя граница дня занятия, включительно. */
  dateTo?: string;
  /** Порядок выдачи. По умолчанию — порядок появления. */
  order?: BookingsOrder;
  offset?: number;
  limit?: number;
}

export interface BookingsRepository {
  findAll(): Promise<Booking[]>;
  findById(id: number): Promise<Booking | null>;
  findMany(filter: BookingsFilter): Promise<Booking[]>;
  insert(booking: Omit<Booking, 'id' | 'createdAt'>): Promise<Booking>;
  update(id: number, patch: Partial<Booking>): Promise<Booking>;
  /**
   * Обновление с условием по ожидаемому прежнему статусу.
   *
   * Возвращает `null`, если статус уже другой — значит кто-то успел раньше.
   * Без такого условия два одновременных запроса выполняют переход оба: заявку
   * и подтверждают, и отклоняют, а счётчик мест уходит на два. Проверка перед
   * записью этого не ловит — между ней и записью всегда есть щель.
   */
  updateIfStatus(
    id: number,
    expected: BookingStatus,
    patch: Partial<Booking>,
  ): Promise<Booking | null>;
  /** Перенос даты слота тянет за собой даты его записей. */
  updateDateByScheduleId(scheduleId: number, date: string): Promise<number>;
  remove(id: number): Promise<void>;
  removeMany(filter: { clubId?: number; trainerId?: number }): Promise<number>;
}

/**
 * Порядок «по дню занятия».
 *
 * Прежде контроллер склеивал день и момент записи в одну строку и сравнивал её
 * целиком. Здесь то же самое разложено на два ключа, а третьим стоит номер:
 * без него две записи одного человека на один день в одну миллисекунду вставали
 * бы в произвольном порядке, и страница 2 могла бы повторить строку со страницы 1.
 */
function compareBySlotDate(left: Booking, right: Booking): number {
  const byDate = left.date.localeCompare(right.date);

  if (byDate !== 0) return byDate;

  // Порядок «ранние первыми» — обратный общему компаратору домена, поэтому знак
  // переворачивается, а не пишется вторая формула сравнения.
  return -compareByCreatedAtDesc(left, right);
}

/**
 * Относится ли запись к клубу.
 *
 * Отличается от `getBookingClubId` намеренно. Хелпер домена отвечает на вопрос
 * «какой клуб у этой записи» и обязан дать ОДИН ответ, поэтому площадка у него
 * перекрывает владельца. Фильтр же спрашивает другое — «участвует ли этот клуб», —
 * и оба места учитываются вместе. Ровно так же устроено условие на базе, где
 * владелец и площадка лежат в разных колонках.
 */
function belongsToClub(booking: Booking, clubId: number): boolean {
  return booking.clubId === clubId || (booking.ownerType === 'club' && booking.ownerId === clubId);
}

/** То же для тренера: он либо владелец занятия, либо ведёт его в чужом зале. */
function belongsToTrainer(booking: Booking, trainerId: number): boolean {
  return (
    booking.trainerId === trainerId ||
    (booking.ownerType === 'trainer' && booking.ownerId === trainerId)
  );
}

export class JsonBookingsRepository implements BookingsRepository {
  constructor(private readonly storage: JsonStorage) {}

  findAll(): Promise<Booking[]> {
    return this.storage.read('bookings');
  }

  async findById(id: number): Promise<Booking | null> {
    const bookings = await this.storage.read('bookings');

    return bookings.find((booking) => booking.id === id) ?? null;
  }

  async findMany(filter: BookingsFilter): Promise<Booking[]> {
    const bookings = await this.storage.read('bookings');
    const statuses =
      filter.status === undefined
        ? null
        : new Set(Array.isArray(filter.status) ? filter.status : [filter.status]);

    const selected = bookings.filter((booking) => {
      if (filter.userId !== undefined && booking.userId !== filter.userId) return false;
      if (filter.scheduleId !== undefined && booking.scheduleId !== filter.scheduleId) return false;
      if (statuses !== null && !statuses.has(booking.status)) return false;
      if (filter.clubId !== undefined && !belongsToClub(booking, filter.clubId)) return false;
      if (filter.trainerId !== undefined && !belongsToTrainer(booking, filter.trainerId)) {
        return false;
      }
      // День занятия — строка `YYYY-MM-DD`, у неё лексикографический порядок
      // совпадает с хронологическим, поэтому границы сравниваются как есть.
      if (filter.dateFrom !== undefined && booking.date < filter.dateFrom) return false;
      if (filter.dateTo !== undefined && booking.date > filter.dateTo) return false;

      return true;
    });

    // Порядок задаётся ЯВНО и до среза: иначе страница зависела бы от того,
    // в каком порядке хранилище отдало строки.
    selected.sort(
      filter.order === 'slotDate' ? compareBySlotDate : (left, right) => left.id - right.id,
    );

    return sliceToPage(selected, filter);
  }

  async insert(booking: Omit<Booking, 'id' | 'createdAt'>): Promise<Booking> {
    const bookings = await this.storage.read('bookings');
    const created: Booking = {
      id: this.storage.getNextEntityId(bookings),
      createdAt: new Date().toISOString(),
      ...booking,
    };

    await this.storage.write('bookings', [...bookings, created]);

    return created;
  }

  async update(id: number, patch: Partial<Booking>): Promise<Booking> {
    const bookings = await this.storage.read('bookings');
    const index = bookings.findIndex((booking) => booking.id === id);

    if (index === -1) {
      // Текст перенесён из db.ts дословно: роуты маппят его в 404.
      throw new Error('Запись не найдена');
    }

    const updated: Booking = { ...bookings[index], ...patch };
    const next = [...bookings];
    next[index] = updated;
    await this.storage.write('bookings', next);

    return updated;
  }

  async updateIfStatus(
    id: number,
    expected: BookingStatus,
    patch: Partial<Booking>,
  ): Promise<Booking | null> {
    const bookings = await this.storage.read('bookings');
    const current = bookings.find((booking) => booking.id === id);

    // У файлового хранилища «условие» настоящим условием быть не может: между
    // чтением и записью всё равно есть щель. Проверка здесь воспроизводит поведение
    // базы, чтобы один и тот же набор проверок проходил на обеих реализациях,
    // но настоящую гарантию даёт только база.
    if (!current || current.status !== expected) return null;

    return this.update(id, patch);
  }

  async updateDateByScheduleId(scheduleId: number, date: string): Promise<number> {
    const bookings = await this.storage.read('bookings');
    let updatedCount = 0;

    const next = bookings.map((booking) => {
      if (booking.scheduleId !== scheduleId || booking.date === date) return booking;
      updatedCount += 1;

      return { ...booking, date };
    });

    if (updatedCount > 0) {
      await this.storage.write('bookings', next);
    }

    return updatedCount;
  }

  async remove(id: number): Promise<void> {
    const bookings = await this.storage.read('bookings');

    await this.storage.write(
      'bookings',
      bookings.filter((booking) => booking.id !== id),
    );
  }

  async removeMany(filter: { clubId?: number; trainerId?: number }): Promise<number> {
    const bookings = await this.storage.read('bookings');
    const kept = bookings.filter((booking) => {
      // Тот же разбор владельца и площадки, что и в отборе: удаление клуба обязано
      // забрать и записи на тренерские занятия в его зале — у них клуб стоит
      // площадкой, а не владельцем, и прежнее условие по одному полю их пропускало.
      if (filter.clubId !== undefined && belongsToClub(booking, filter.clubId)) return false;
      if (filter.trainerId !== undefined && belongsToTrainer(booking, filter.trainerId)) {
        return false;
      }

      return true;
    });

    await this.storage.write('bookings', kept);

    return bookings.length - kept.length;
  }
}
