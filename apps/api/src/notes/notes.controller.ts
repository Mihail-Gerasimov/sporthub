// CRM-заметки о клиентах — при ЛИЦЕ услуг.
//
// Заметку можно завести только про клиента этого лица: у человека должна быть
// хотя бы одна запись на этот клуб или на эту карточку тренера.
//
// Phase 35 Step 35.27a (решение заказчика 19): заметка принадлежит ЛИЦУ, а не
// человеку. Раньше `provider_user_id` был человеком, и владелец четырёх клубов
// видел клиентов всех четырёх одной кучей, а заметку писал «вообще». Довод,
// ради которого выбран этот вариант: когда у клуба появится несколько
// управляющих, заметки должны остаться ПРИ КЛУБЕ, а не уйти вместе с тем, кто
// их писал. Отсюда два следствия, которые видны по всему файлу: читает и правит
// заметки лица тот, кто ЛИЦОМ управляет (а не только автор), а «клиентом»
// человек считается по записям на ЭТО лицо, а не на все лица владельца.
//
// Автор (`providerUserId`) остаётся: это авторство на момент записи и быстрый
// срез «все мои заметки» для того, кто лицо не назвал.
//
// Phase 34 Step 34.25: провайдер берётся ИЗ СЕССИИ и больше ниоткуда. До этого
// номер приезжал в теле и в строке запроса — и проверки владения, которые здесь
// были и остаются, сверяли ровно то, что клиент сам про себя сообщил. Дыра была
// самой тяжёлой на платформе: `?scope=all` отдавал анонимному гостю ВСЕ заметки
// всех провайдеров обо всех клиентах, а без него хватало подставить чужой номер
// в строку запроса, чтобы прочитать чужую переписку о людях.

import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import type { ProviderClientNote, ServiceFaceRef } from '@sporthub/types';
import { APP_LIMITS, CATALOG_OWNER_TYPES } from '@sporthub/types';
import { z } from 'zod';

import { AccessService } from '../access/access.service';
import { CurrentUser, Requires } from '../auth/access.decorators';
import type { SessionContext } from '../auth/session.service';
import { EMPTY_RESULT, type EmptyResult } from '../common/api-response';
import { ForbiddenError, NotFoundError, ValidationError } from '../common/domain-error';
import type { ProviderClientNotesRepository } from '../repositories/crud.repository';
import { PROVIDER_CLIENT_NOTES_REPOSITORY } from '../repositories/crud.repository';
import type { BookingsRepository } from '../repositories/bookings.repository';
import { BOOKINGS_REPOSITORY } from '../repositories/bookings.repository';

// ⚠️ Ни `providerUserId`, ни `userId` в схемах тела больше нет и быть не должно:
// автор заметки — это личность, а личность приходит из сессии. Поле, возвращённое
// сюда «для удобства фронта», вернёт и дыру целиком.
/**
 * Лицо услуг в запросе — пара «вид + номер», оба поля или ни одного (шаг 35.27a).
 *
 * Объявлена ОДИН раз и разбирает и тело, и строку запроса: половина пары —
 * это опечатка клиента, и отвечать на неё в двух местах по-разному нельзя.
 * Необязательна намеренно: старый клиент лица не шлёт и обязан пережить выкатку.
 */
const faceSchema = z
  .object({
    faceType: z.enum(CATALOG_OWNER_TYPES).optional(),
    faceId: z.coerce.number().int().positive().optional(),
  })
  .refine(
    (value) => (value.faceType === undefined) === (value.faceId === undefined),
    'Лицо услуг задаётся парой «вид + номер»',
  );

/** Разбор пары в ссылку на лицо. Пусто — лицо не названо. */
function toFace(value: {
  faceType?: 'club' | 'trainer';
  faceId?: number;
}): ServiceFaceRef | undefined {
  return value.faceType === undefined || value.faceId === undefined
    ? undefined
    : { type: value.faceType, id: value.faceId };
}

const createSchema = z
  .object({
    clientUserId: z.number().int().positive(),
    note: z.string().trim().min(1).max(APP_LIMITS.providerNoteMaxLength),
    bookingId: z.number().int().positive().optional(),
    faceType: z.enum(CATALOG_OWNER_TYPES).optional(),
    faceId: z.number().int().positive().optional(),
  })
  .strict()
  .refine(
    (value) => (value.faceType === undefined) === (value.faceId === undefined),
    'Лицо услуг задаётся парой «вид + номер»',
  );

/** Разбор строки запроса выдачи: клиент и лицо. */
const listQuerySchema = faceSchema.and(
  z.object({ clientUserId: z.coerce.number().int().positive().optional() }),
);

const patchSchema = z
  .object({
    note: z.string().trim().min(1).max(APP_LIMITS.providerNoteMaxLength).optional(),
    bookingId: z.number().int().positive().nullable().optional(),
  })
  .strict();

function parseNoteId(raw: string): number {
  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ValidationError('Некорректный id');
  }

  return parsed;
}

// Весь раздел — работа провайдера со своими клиентами, и право у всех четырёх
// маршрутов одно. Пометка стоит на классе, а не на каждом методе: маршрут,
// добавленный сюда завтра, окажется под тем же правом сам.
@Controller('provider-client-notes')
export class ProviderClientNotesController {
  constructor(
    @Inject(PROVIDER_CLIENT_NOTES_REPOSITORY)
    private readonly notes: ProviderClientNotesRepository,
    @Inject(BOOKINGS_REPOSITORY) private readonly bookings: BookingsRepository,
    private readonly access: AccessService,
  ) {}

  /**
   * Заметки ТЕКУЩЕГО провайдера. Отбор по клиенту — необязательное сужение.
   *
   * Режим `?scope=all` убран совсем, а не закрыт правом администратора. Причины
   * две. Первая: после переноса личности в сессию умолчание отдаёт ровно то, ради
   * чего единственный потребитель (сводка клиентов в кабинете провайдера) звал
   * `scope=all`, — СВОИ заметки; закрывать правом было бы нечего. Вторая: срез
   * «все приватные заметки всех провайдеров» — это новая возможность, а не
   * сохранение старой, и заводить её без спроса, да ещё на самых чувствительных
   * данных площадки, не стоит. Понадобится админский разбор жалобы — маршрут
   * заведётся отдельно и под своим правом.
   *
   * Неизвестные параметры строки запроса (включая пришедший от старого клиента
   * `scope=all`) молча игнорируются: старая страница переживает выкатку и получает
   * свои заметки, а не отказ.
   */
  @Get()
  async findMany(
    @Query() rawQuery: Record<string, string>,
    @CurrentUser() session: SessionContext,
  ): Promise<ProviderClientNote[]> {
    const parsed = listQuerySchema.safeParse(rawQuery);

    if (!parsed.success) {
      throw new ValidationError('Некорректные параметры запроса');
    }

    const face = toFace(parsed.data);

    // ⚠️ Шаг 35.27a. Названо лицо — отдаём заметки ЛИЦА, и владение сверяется.
    //
    // Сужать выдачу лица ещё и автором нельзя, и это не упрощение: ровно ради
    // этого заметка и переехала с человека на лицо. Появится у клуба второй
    // управляющий — он обязан видеть заметки о клиентах своего клуба, а не только
    // те, что написал сам.
    if (face !== undefined) {
      await this.access.requireOwnedFace(session.user.id, face);

      return this.notes.findMany({ face, clientUserId: parsed.data.clientUserId });
    }

    // Лицо не названо — прежний срез «все мои заметки». Старый клиент переживает
    // выкатку и получает ровно то, что получал.
    return this.notes.findMany({
      providerUserId: session.user.id,
      clientUserId: parsed.data.clientUserId,
    });
  }

  @Post()
  async create(
    @Body() rawBody: unknown,
    @CurrentUser() session: SessionContext,
  ): Promise<ProviderClientNote> {
    const parsed = createSchema.safeParse(rawBody);

    if (!parsed.success) {
      throw new ValidationError('Некорректные данные запроса');
    }

    const { clientUserId, note, bookingId } = parsed.data;
    const namedFace = toFace(parsed.data);
    // Автор заметки — тот, от чьего лица работают: под имперсонизацией админ ведёт
    // клиентов провайдера, и заметка обязана остаться заметкой провайдера.
    const providerUserId = session.user.id;

    // Клиент — тот, у кого есть хотя бы одна запись на публикацию провайдера.
    //
    // ⚠️ Раньше ради этой проверки поднимались ЦЕЛИКОМ три таблицы: все записи
    // платформы, все клубы и все тренеры. Теперь два точечных запроса: публикации
    // провайдера (по индексу владельца) и СЧЁТ записей клиента на них. Считает
    // база, а не длина массива, и ни одна строка записей не доезжает до приложения.
    //
    // Владения спрашиваются у `AccessService`, а не собираются здесь: тот же вопрос
    // задаёт срез записей клиентов (`GET /api/bookings?scope=clients`), и понимать
    // владение они обязаны ОДИНАКОВО — иначе заметку можно будет завести о человеке,
    // которого второй маршрут клиентом не считает.
    // ⚠️ Шаг 35.13, точка 9. Заметка о самом себе — не заметка о клиенте.
    // Записавшись на своё занятие (решение 16 это разрешает), человек формально
    // становится клиентом собственной публикации, и без этой проверки завёл бы
    // клиентскую карточку сам на себя.
    if (await this.access.isSelfDealing(providerUserId, { kind: 'client', clientUserId })) {
      throw new ForbiddenError('Нельзя завести клиентскую заметку о самом себе');
    }

    // ⚠️ Шаг 35.27a. Заметка ложится ПРИ ЛИЦЕ, и лицо это определяется до записи.
    //
    // Названо лицо — сверяется владение им, а «клиентом» человек считается по
    // записям на ЭТО лицо, а не на все лица человека. Иначе клиент одного клуба
    // получал бы карточку во втором клубе того же владельца — та самая куча,
    // которую шаг и разбирает.
    const owners =
      namedFace === undefined
        ? await this.access.getManagedPublicationIds(providerUserId)
        : await this.access.requireOwnedFace(providerUserId, namedFace);

    // Клиенты выводятся из записей на лица, поэтому без лиц их не бывает вовсе —
    // и второй запрос не нужен.
    const visited =
      owners.clubIds.length + owners.trainerIds.length === 0
        ? []
        : await this.access.facesVisitedBy(clientUserId, owners);

    if (visited.length === 0) {
      throw new ForbiddenError('Этот пользователь не является вашим клиентом');
    }

    // Лицо не названо — оно ВЫВОДИТСЯ, но только когда вывод однозначен.
    //
    // ⚠️ Выбрать одно из нескольких наугад нельзя: заметка молча спряталась бы
    // от второго кабинета, и владелец никогда не узнал бы почему. Отказ здесь
    // громкий и объясняет, чего не хватает, — это и есть разница между
    // расширением и тихой поломкой.
    if (namedFace === undefined && visited.length > 1) {
      throw new ValidationError(
        'Укажите лицо услуг: этот человек записан к нескольким вашим клубам или карточкам',
      );
    }

    const face = namedFace ?? visited[0];

    return this.notes.insert({
      providerUserId,
      clientUserId,
      note,
      bookingId,
      faceType: face.type,
      faceId: face.id,
    });
  }

  @Patch(':id')
  async update(
    @Param('id') rawId: string,
    @Body() rawBody: unknown,
    @CurrentUser() session: SessionContext,
  ): Promise<ProviderClientNote> {
    const noteId = parseNoteId(rawId);
    const parsed = patchSchema.safeParse(rawBody);

    if (!parsed.success) {
      throw new ValidationError('Некорректные данные запроса');
    }

    await this.requireOwn(noteId, session.user.id, 'редактирования');

    // `null` в поле записи снимает привязку, отсутствие поля её не трогает.
    const patch: { note?: string; bookingId?: number } = {};

    if (parsed.data.note !== undefined) {
      patch.note = parsed.data.note;
    }

    if (parsed.data.bookingId !== undefined) {
      patch.bookingId = parsed.data.bookingId ?? undefined;
    }

    return this.notes.update(noteId, patch);
  }

  // Тело здесь не читается вовсе: единственным, что в нём было, оставался номер
  // автора, а он теперь берётся из сессии.
  @Delete(':id')
  async remove(
    @Param('id') rawId: string,
    @CurrentUser() session: SessionContext,
  ): Promise<EmptyResult> {
    const noteId = parseNoteId(rawId);

    await this.requireOwn(noteId, session.user.id, 'удаления');
    await this.notes.remove(noteId);

    return EMPTY_RESULT;
  }

  /**
   * Заметка обязана существовать и быть заметкой ЛИЦА, которым человек управляет.
   *
   * ⚠️ Шаг 35.27a. Раньше сверялся автор, и это было то же самое ровно потому, что
   * у лица бывал один управляющий. Правит и удаляет теперь тот, кто ведёт лицо, —
   * иначе с приходом второго управляющего заметки его клуба оказались бы для него
   * доступны только на чтение.
   *
   * У заметок старого образца лица нет; для них правило прежнее — автор. Так они
   * остаются доступны тому, кто их писал, а не повисают без хозяина.
   */
  private async requireOwn(
    noteId: number,
    userId: number,
    action: string,
  ): Promise<ProviderClientNote> {
    const existing = await this.notes.findById(noteId);

    if (!existing) {
      throw new NotFoundError('Заметка не найдена');
    }

    const face = toFace(existing);
    const allowed =
      face === undefined
        ? existing.providerUserId === userId
        : await this.access.isManagerOfFace(face, userId);

    if (!allowed) {
      throw new ForbiddenError(`Недостаточно прав для ${action} заметки`);
    }

    return existing;
  }
}

export const NOTE_CONTROLLERS = [ProviderClientNotesController];
