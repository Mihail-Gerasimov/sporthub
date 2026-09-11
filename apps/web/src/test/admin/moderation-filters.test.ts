// Разбор отбора раздела модерации из адреса (шаг 37.54).
//
// ⚠️ Почему это отдельный набор, а не проверка через страницу. Разбор — единственное
// место, где мусор из адреса встречается с кодом: адрес пишет кто угодно, в том числе
// руками и по старой ссылке из уведомления. Проверять его через отрисовку значит
// проверять два дела сразу и не узнать, какое именно сломалось.
//
// Главное требование к разбору: негодное значение ведёт себя как ОТСУТСТВУЮЩЕЕ.
// Не «страница показала ошибку» и не «страница упала», а «параметра как будто нет».

import { describe, expect, it } from 'vitest';

import {
  MODERATION_DEFAULT_FILTERS,
  MODERATION_PAGE_SIZE,
  moderationAddressQuery,
  moderationRequestQuery,
  parseModerationFilters,
} from '@/lib/moderation-filters';

/** Короткая запись: адрес → разобранный отбор. */
const parse = (query: string) => parseModerationFilters(new URLSearchParams(query));

describe('Отбор раздела модерации — разбор адреса', () => {
  it('без параметров отдаёт умолчания: раздел из меню открывается как прежде', () => {
    expect(parse('')).toEqual(MODERATION_DEFAULT_FILTERS);
  });

  it('годные значения читаются все до одного', () => {
    expect(
      parse(
        'status=hidden&type=trainer&recheck=awaiting&city=Самара&sportId=3&search=волна&page=2',
      ),
    ).toEqual({
      status: 'hidden',
      type: 'trainer',
      recheck: 'awaiting',
      city: 'Самара',
      sportId: '3',
      search: 'волна',
      page: 2,
      focusId: null,
    });
  });

  it('неизвестный тип публикации — как будто параметра нет', () => {
    expect(parse('type=venue').type).toBe('all');
    expect(parse('type=').type).toBe('all');
  });

  it('неизвестное состояние и неизвестная очередь — как будто параметра нет', () => {
    expect(parse('status=deleted').status).toBe('all');
    expect(parse('recheck=maybe').recheck).toBe('all');
  });

  it('нечисловая и отрицательная страница — первая', () => {
    expect(parse('page=abc').page).toBe(1);
    expect(parse('page=-3').page).toBe(1);
    expect(parse('page=0').page).toBe(1);
    expect(parse('page=2.5').page).toBe(1);
    expect(parse('page=').page).toBe(1);
  });

  it('нечисловой вид спорта — как будто параметра нет', () => {
    expect(parse('sportId=abc').sportId).toBe('');
    expect(parse('sportId=-1').sportId).toBe('');
    expect(parse('sportId=7').sportId).toBe('7');
  });

  it('негодный номер публикации не наводит ни на что и не роняет разбор', () => {
    expect(parse('id=abc').focusId).toBeNull();
    expect(parse('id=-5').focusId).toBeNull();
    expect(parse('id=0').focusId).toBeNull();
    expect(parse('id=').focusId).toBeNull();
    expect(parse('id=1e3').focusId).toBeNull();
  });

  it('номер публикации читается как номер, а не как слаг', () => {
    // ⚠️ В уведомлении лежит НОМЕР, публичная страница адресуется слагом.
    // Внутри панели перевода в слаг не происходит.
    expect(parse('type=club&id=42')).toEqual({
      ...MODERATION_DEFAULT_FILTERS,
      type: 'club',
      focusId: 42,
    });
  });

  it('наводка на публикацию раздвигает отбор, способный её спрятать', () => {
    // Публикация из уведомления может быть скрытой, архивированной, какой угодно.
    // Пришедший по ссылке обязан её увидеть, а не гадать, какой фильтр её съел.
    expect(
      parse(
        'type=club&id=42&status=published&recheck=awaiting&city=Самара&sportId=3&search=нет&page=4',
      ),
    ).toEqual({
      ...MODERATION_DEFAULT_FILTERS,
      type: 'club',
      focusId: 42,
    });
  });
});

describe('Отбор раздела модерации — сборка адреса', () => {
  it('умолчания не пишутся в адрес: раздел из меню остаётся с чистым адресом', () => {
    expect(moderationAddressQuery(MODERATION_DEFAULT_FILTERS)).toBe('');
  });

  it('адрес и разбор — обратимы: что собрали, то и прочитали', () => {
    const filters = {
      status: 'hidden' as const,
      type: 'club' as const,
      recheck: 'awaiting' as const,
      city: 'Самара',
      sportId: '3',
      search: 'волна',
      page: 3,
      focusId: null,
    };

    expect(parse(moderationAddressQuery(filters))).toEqual(filters);
  });

  it('наводка на публикацию обратима так же', () => {
    const filters = { ...MODERATION_DEFAULT_FILTERS, type: 'trainer' as const, focusId: 42 };

    expect(parse(moderationAddressQuery(filters))).toEqual(filters);
  });
});

describe('Отбор раздела модерации — адрес запроса', () => {
  it('умолчания просят только страницу: прежний первый запрос не изменился', () => {
    const query = moderationRequestQuery(MODERATION_DEFAULT_FILTERS);

    expect(query).toBe(`offset=0&limit=${MODERATION_PAGE_SIZE}`);
  });

  it('весь отбор уходит В ЗАПРОС, а не отсеивается после ответа', () => {
    const query = moderationRequestQuery({
      status: 'hidden',
      type: 'club',
      recheck: 'awaiting',
      city: 'Самара',
      sportId: '3',
      search: '  волна  ',
      page: 3,
      focusId: null,
    });
    const params = new URLSearchParams(query);

    expect(params.get('status')).toBe('hidden');
    expect(params.get('type')).toBe('club');
    expect(params.get('awaitingRecheck')).toBe('true');
    expect(params.get('city')).toBe('Самара');
    expect(params.get('sportId')).toBe('3');
    expect(params.get('search')).toBe('волна');
    // Постраничность тоже в запросе: страница 3 — это смещение на две страницы.
    expect(params.get('offset')).toBe(String(2 * MODERATION_PAGE_SIZE));
    expect(params.get('limit')).toBe(String(MODERATION_PAGE_SIZE));
  });

  it('номер публикации уходит В ЗАПРОС, а не отбирается в памяти', () => {
    const params = new URLSearchParams(
      moderationRequestQuery({ ...MODERATION_DEFAULT_FILTERS, type: 'club', focusId: 42 }),
    );

    expect(params.get('id')).toBe('42');
    expect(params.get('type')).toBe('club');
  });
});
