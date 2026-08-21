// Репозиторий записей на тренировки.
//
// Здесь только доступ к данным. Правила переходов живут в `@sporthub/domain`
// (чистые функции), а оркестрация — проверки, пересчёт мест, уведомления —
// в сервисе. Такое разделение и есть смысл фазы: репозиторий подменяется
// на Prisma-версию, а правила и сервис не трогаются.

import { compareByCreatedAtDesc } from '@sporthub/domain';
import type { Booking, BookingStatus, CatalogOwnerType } from '@sporthub/types';

import { groupByDay, isOnOrAfterDay, ownerIdMatcher, sliceToPage } from './crud.repository';
import type { DailyCount, OwnerIdFilter } from './crud.repository';
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
  /** Вид спорта записи. */
  sportId?: number;
  /**
   * Нижняя граница ДНЯ создания записи, включительно, строка `YYYY-MM-DD`.
   *
   * Это не то же самое, что `dateFrom`: там день ЗАНЯТИЯ, здесь момент записи.
   * Периоды сводки («сегодня», «неделя», «месяц») отсчитываются именно от него.
   */
  createdFrom?: string;
  /**
   * Ограничение по публикациям: запись относится хотя бы к одной из перечисленных.
   *
   * Отличается от пары `clubId`/`trainerId` тем, что это ОДНО условие на два набора,
   * а не два условия подряд. Так отбирает сводка по городу: своего города у записи
   * нет, и она берётся через уже отобранные клубы и тренеров.
   */
  owners?: OwnerIdFilter;
  /** Порядок выдачи. По умолчанию — порядок появления. */
  order?: BookingsOrder;
  offset?: number;
  limit?: number;
}

/**
 * Отбор для подсчётов: тот же фильтр без порядка и постраничности.
 *
 * Резать и сортировать подсчёту нечего, и это видно прямо в сигнатуре: тип, который
 * не даёт передать `limit` в `count`, надёжнее комментария о том, что его там не ждут.
 */
export type BookingsCountFilter = Omit<BookingsFilter, 'order' | 'offset' | 'limit'>;

/** Записи по одному виду спорта. */
export interface SportBookingCount {
  sportId: number;
  count: number;
}

/** Записи по одной публикации: клуб или тренер, к которым они относятся. */
export interface OwnerBookingCount {
  type: CatalogOwnerType;
  id: number;
  count: number;
}

export interface BookingsRepository {
  findAll(): Promise<Booking[]>;
  findById(id: number): Promise<Booking | null>;
  findMany(filter: BookingsFilter): Promise<Booking[]>;
  /** Сколько записей подошло под отбор. Считает запрос, а не длина массива. */
  count(filter: BookingsCountFilter): Promise<number>;
  /**
   * График записей по дням создания. Дни идут по возрастанию, пустые пропущены.
   * Возвращает по строке на день, а не по строке на запись.
   */
  countByCreatedDay(filter: BookingsCountFilter): Promise<DailyCount[]>;
  /**
   * Записи по видам спорта.
   *
   * Порядок — по номеру ПЕРВОЙ подошедшей записи вида спорта, по возрастанию.
   * Порядок задан явно, потому что потребитель ранжирует выдачу устойчивой
   * сортировкой по числу записей: при равных числах порядок определяет именно он,
   * и обе реализации обязаны дать один и тот же.
   */
  countBySport(filter: BookingsCountFilter): Promise<SportBookingCount[]>;
  /**
   * Записи по публикациям — клубам и тренерам вместе.
   *
   * Запись у тренерского занятия в чужом зале относится и к тренеру, и к клубу,
   * поэтому попадает в обе строки: так же считала сводка, обходя выдачу вручную.
   *
   * Порядок — по номеру первой подошедшей записи публикации; при совпадении клуб
   * идёт раньше тренера. Это тот же порядок, в котором сводка складывала счётчики,
   * и от него зависит верхушка при равном числе записей.
   */
  countByOwner(filter: BookingsCountFilter): Promise<OwnerBookingCount[]>;
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

  /**
   * Отбор без порядка и среза — один на выдачу и на все подсчёты.
   *
   * Один набор условий на пять методов, а не пять его копий: разъехавшись, счётчик
   * сводки и её же выдача начали бы показывать разные числа на одной странице.
   */
  private async select(filter: BookingsCountFilter): Promise<Booking[]> {
    const bookings = await this.storage.read('bookings');
    const statuses =
      filter.status === undefined
        ? null
        : new Set(Array.isArray(filter.status) ? filter.status : [filter.status]);
    const matchesOwner = ownerIdMatcher(filter.owners);

    return bookings.filter((booking) => {
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
      if (filter.sportId !== undefined && booking.sportId !== filter.sportId) return false;
      if (!isOnOrAfterDay(booking.createdAt, filter.createdFrom)) return false;

      return matchesOwner(booking);
    });
  }

  async findMany(filter: BookingsFilter): Promise<Booking[]> {
    const selected = await this.select(filter);

    // Порядок задаётся ЯВНО и до среза: иначе страница зависела бы от того,
    // в каком порядке хранилище отдало строки.
    selected.sort(
      filter.order === 'slotDate' ? compareBySlotDate : (left, right) => left.id - right.id,
    );

    return sliceToPage(selected, filter);
  }

  async count(filter: BookingsCountFilter): Promise<number> {
    return (await this.select(filter)).length;
  }

  async countByCreatedDay(filter: BookingsCountFilter): Promise<DailyCount[]> {
    // Граница периода уже применена отбором, второй раз её передавать не нужно.
    return groupByDay(await this.select(filter));
  }

  async countBySport(filter: BookingsCountFilter): Promise<SportBookingCount[]> {
    const selected = await this.select(filter);
    const counts = new Map<number, number>();
    // Порядок — по номеру ПЕРВОЙ записи вида спорта, а не по месту в массиве:
    // порядок строк задаёт хранилище, а порядок номеров одинаков у обоих.
    const firstIds = new Map<number, number>();

    for (const booking of selected) {
      counts.set(booking.sportId, (counts.get(booking.sportId) ?? 0) + 1);
      firstIds.set(
        booking.sportId,
        Math.min(firstIds.get(booking.sportId) ?? booking.id, booking.id),
      );
    }

    return [...counts.entries()]
      .map(([sportId, count]) => ({ sportId, count }))
      .sort(
        (left, right) => (firstIds.get(left.sportId) ?? 0) - (firstIds.get(right.sportId) ?? 0),
      );
  }

  async countByOwner(filter: BookingsCountFilter): Promise<OwnerBookingCount[]> {
    const selected = await this.select(filter);
    // Ключ склеен из вида и номера: клуб 1 и тренер 1 — разные публикации
    // с одинаковым номером, и в общем счётчике их путать нельзя.
    const counts = new Map<string, { type: CatalogOwnerType; id: number; count: number }>();
    // Первое появление считается по НОМЕРУ записи, а не по месту в массиве:
    // порядок строк задаёт хранилище, а порядок номеров одинаков у обоих.
    const firstIds = new Map<string, number>();

    const add = (type: CatalogOwnerType, id: number, bookingId: number): void => {
      const key = `${type}:${id}`;
      const current = counts.get(key);

      counts.set(key, { type, id, count: (current?.count ?? 0) + 1 });
      firstIds.set(key, Math.min(firstIds.get(key) ?? bookingId, bookingId));
    };

    for (const booking of selected) {
      // Клуб раньше тренера — тот же порядок, в котором складывала счётчики сводка.
      if (booking.clubId !== undefined) add('club', booking.clubId, booking.id);
      if (booking.trainerId !== undefined) add('trainer', booking.trainerId, booking.id);
    }

    return [...counts.entries()]
      .sort(([leftKey, left], [rightKey, right]) => {
        const byFirst = (firstIds.get(leftKey) ?? 0) - (firstIds.get(rightKey) ?? 0);

        if (byFirst !== 0) return byFirst;

        // В одной записи клуб идёт раньше тренера.
        return left.type === right.type ? 0 : left.type === 'club' ? -1 : 1;
      })
      .map(([, value]) => value);
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
