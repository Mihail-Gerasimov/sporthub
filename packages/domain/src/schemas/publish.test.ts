// Схемы создания и правки публикации — разные обещания.
//
// Шаг 36.4, решение заказчика 1. До этой фазы `publishClubSchema` разбирал и POST,
// и PATCH: расписание было обязательным всегда, и правка одного телефона обязана
// была прислать расписание целиком. Кто его не прислал — терял слоты вместе
// с записями людей.
//
// Смягчить общую схему было нельзя: это разрешило бы СОЗДАТЬ публикацию без
// расписания, и она вышла бы в каталог нерабочей. Поэтому схем стало две,
// и этот набор держит границу между ними с обеих сторон.

import { describe, expect, it } from 'vitest';

import {
  editClubSchema,
  editTrainerSchema,
  publishClubSchema,
  publishTrainerSchema,
} from './publish';

/** Слот, годный по всем правилам: время кратно 10, направление из публикации. */
const slot = (overrides: Record<string, unknown> = {}) => ({
  title: 'Тренировка',
  date: '2026-10-01',
  startTime: '09:00',
  endTime: '10:00',
  price: '1000',
  capacity: '10',
  location: 'Зал 1',
  sportId: 1,
  ...overrides,
});

const clubPayload = (overrides: Record<string, unknown> = {}) => ({
  name: 'Клуб',
  city: 'Самара',
  address: 'ул. Ленина, 1',
  description: 'Описание клуба длиной не меньше пятидесяти символов, чтобы схема его приняла.',
  phone: '+7 (900) 000-00-00',
  email: '',
  priceFrom: '1000',
  sportIds: [1],
  tagIds: [],
  amenityIds: [],
  vk: '',
  telegram: '',
  facebook: '',
  scheduleSlots: [slot()],
  ...overrides,
});

const trainerPayload = (overrides: Record<string, unknown> = {}) => ({
  firstName: 'Иван',
  lastName: 'Иванов',
  city: 'Самара',
  address: 'ул. Ленина, 2',
  bio: 'Описание тренера длиной не меньше пятидесяти символов, чтобы схема его приняла.',
  experience: '5',
  sportIds: [1],
  specialtyIds: [1],
  workFormatIds: [1],
  phone: '+7 (900) 000-00-01',
  vk: '',
  telegram: '',
  facebook: '',
  offeringName: 'Персональная тренировка',
  offeringDescription: 'Занятие один на один',
  offeringFormat: 'Индивидуально',
  offeringPrice: '2000',
  offeringDuration: '60',
  offeringLocation: 'Зал 2',
  clubId: null,
  scheduleSlots: [slot()],
  ...overrides,
});

describe('создание публикации: расписание обязательно', () => {
  it('клуб без расписания не создаётся', () => {
    const { scheduleSlots: _absent, ...withoutSlots } = clubPayload();
    const result = publishClubSchema.safeParse(withoutSlots);

    expect(result.success).toBe(false);
  });

  it('клуб с пустым расписанием не создаётся', () => {
    const result = publishClubSchema.safeParse(clubPayload({ scheduleSlots: [] }));

    expect(result.success).toBe(false);
  });

  it('карточка тренера без расписания не создаётся', () => {
    const { scheduleSlots: _absent, ...withoutSlots } = trainerPayload();
    const result = publishTrainerSchema.safeParse(withoutSlots);

    expect(result.success).toBe(false);
  });
});

describe('правка публикации: расписание необязательно', () => {
  it('клуб правится без расписания вовсе', () => {
    const { scheduleSlots: _absent, ...withoutSlots } = clubPayload();
    const result = editClubSchema.safeParse(withoutSlots);

    expect(result.success).toBe(true);
  });

  it('отсутствующее расписание не превращается в пустой массив', () => {
    // Различие принципиальное: пустой массив означал бы «убрать все слоты»,
    // отсутствие — «не трогать». Если схема подставит `[]`, сервис снесёт
    // расписание вместе с записями, и снаружи это будет выглядеть успехом.
    const { scheduleSlots: _absent, ...withoutSlots } = clubPayload();
    const result = editClubSchema.safeParse(withoutSlots);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scheduleSlots).toBeUndefined();
    }
  });

  it('пустое расписание при правке отклоняется', () => {
    // Публикация без единого слота нерабочая, каким бы путём она такой ни стала.
    const result = editClubSchema.safeParse(clubPayload({ scheduleSlots: [] }));

    expect(result.success).toBe(false);
  });

  it('присланное расписание проверяется теми же правилами', () => {
    const result = editClubSchema.safeParse(
      clubPayload({ scheduleSlots: [slot({ startTime: '09:07' })] }),
    );

    expect(result.success).toBe(false);
  });

  it('карточка тренера правится без расписания', () => {
    const { scheduleSlots: _absent, ...withoutSlots } = trainerPayload();
    const result = editTrainerSchema.safeParse(withoutSlots);

    expect(result.success).toBe(true);
  });

  it('прочие обязательные поля при правке остаются обязательными', () => {
    // Правка — не частичное обновление: клиент присылает карточку целиком.
    // Смягчено ровно одно поле, и этот тест сторожит, что ровно одно.
    const { name: _absent, ...withoutName } = clubPayload();
    const result = editClubSchema.safeParse(withoutName);

    expect(result.success).toBe(false);
  });
});

describe('сверка направлений слотов при необязательном расписании', () => {
  // ⚠️ Ловушка 2 фазы 36. Оба `refine` разыменовывали `data.scheduleSlots` без
  // проверки. Стоило полю стать необязательным — и refine падал исключением,
  // а `safeParse` исключения из refine НЕ ловит: наружу уходил бы 500 вместо 400.

  it('правка без расписания не роняет сверку направлений', () => {
    const { scheduleSlots: _absent, ...withoutSlots } = clubPayload();

    expect(() => editClubSchema.safeParse(withoutSlots)).not.toThrow();
  });

  it('правка карточки тренера без расписания не роняет сверку', () => {
    const { scheduleSlots: _absent, ...withoutSlots } = trainerPayload();

    expect(() => editTrainerSchema.safeParse(withoutSlots)).not.toThrow();
  });

  it('чужое направление в слоте отклоняется и при правке', () => {
    const result = editClubSchema.safeParse(
      clubPayload({ sportIds: [1], scheduleSlots: [slot({ sportId: 99 })] }),
    );

    expect(result.success).toBe(false);
  });
});
