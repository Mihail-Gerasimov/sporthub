// Контракт боевых текстов главной: интерфейс не обещает отсутствующие возможности
// и не содержит вымышленных чисел.
//
// ⚠️ Зачем. Словарь `lib/home-copy.ts` собирают трое, и «дословно» без эталона в тесте
// превратилось бы в «примерно»: одно поправленное слово в словаре зелёное для всех
// тестов компонентов — они читают тот же словарь. Здесь строки макета переписаны
// ЛИТЕРАЛАМИ, а не импортом: снимок и есть эталон, менять его — только вслед за макетом.
//
// Регистр заголовков: макет пишет H1/H2 капителью в исходнике («НАЙДИ ЗАЛ,»), у нас
// строки в предложном регистре, капитель даёт CSS (`.t-hero`, `.t-h2`, `.t-cta`) —
// на экране одно и то же, а диктор не читает «ЗА» по буквам. Сравниваются в верхнем
// регистре — это единственное намеренное отличие, и оно названо здесь.
//
// Не переносится сознательно (записано в реестре): «Онлайн» на карточке героя — заменён
// на «Верифицирован» по `verifiedAt` (38.116); расстояние до клуба — геолокации нет (38.118).

import { describe, expect, it } from 'vitest';

import { COUNTER_LABELS, CTA, FEATURES, HERO, SHOWCASE, STEPS } from '@/lib/home-copy';

/** Тексты, допустимые в боевой витрине. */
const PRODUCTION_COPY = {
  hero: {
    eyebrowTag: 'ПРОСПОРТ',
    eyebrow: 'Тренировки начинаются с правильного выбора',
    title: ['НАЙДИ ЗАЛ,', 'ЗАПИШИСЬ', 'ЗА 2 МИНУТЫ.'],
    subtitle:
      'Каждый день — возможность стать сильнее. Выбирай подходящее занятие и двигайся к своей цели шаг за шагом.',
    counters: ['Спортсменов', 'Тренеров', 'Клубов', 'Отзывов'],
  },
  steps: {
    eyebrow: 'Как это работает', // :507
    title: 'ТРИ ШАГА ДО ПЕРВОЙ ТРЕНИРОВКИ', // :510
    items: [
      [
        '01',
        'Найди и выбери',
        'Фильтруй по виду спорта, цене, рейтингу. Смотри фото залов, читай реальные отзывы.',
      ],
      [
        '02',
        'Забронируй онлайн',
        'Выбери удобное время в расписании и отправь заявку без звонков и ожидания.',
      ],
      [
        '03',
        'Тренируйся и расти',
        'Посещай занятия и отслеживай свою активность и историю записей в кабинете.',
      ],
    ], // :515-520
  },
  features: {
    eyebrow: 'Уже работает',
    title: ['ВОЗМОЖНОСТИ', 'ПЛАТФОРМЫ'],
    tryFree: 'Попробовать бесплатно',
    items: [
      ['Онлайн-запись', 'Бронируй занятия без звонков — в 2 клика прямо в расписании'],
      [
        'Статистика тренировок',
        'Смотри историю занятий, активность и динамику за выбранный период',
      ],
    ],
  },
  showcase: {
    clubs: {
      eyebrow: 'Клубы',
      title: ['СПОРТИВНЫЕ КЛУБЫ', 'НА ПЛАТФОРМЕ'],
      all: 'Все клубы',
    },
    trainers: {
      eyebrow: 'Тренеры',
      title: ['ТРЕНЕРЫ', 'НА ПЛАТФОРМЕ'],
      all: 'Все тренеры',
    },
  },
  cta: {
    eyebrow: 'Регистрация открыта',
    title: ['НАЧНИ ТРЕНИРОВАТЬСЯ', 'УМНЕЕ УЖЕ СЕГОДНЯ.'],
    body: 'Создай аккаунт, выбери клуб или тренера и запишись на подходящее занятие.',
    primary: 'Создать аккаунт',
    secondary: 'Смотреть клубы',
    footnote:
      'Счётчики платформы обновляются по фактическим данным зарегистрированных пользователей.',
  },
} as const;

/** Строки заголовка словаря в регистре макета — капитель даёт CSS. */
const upper = (lines: readonly string[]) => lines.map((line) => line.toUpperCase());

describe('Боевые тексты главной не содержат вымышленных обещаний', () => {
  it('герой: плашка, H1, подзаголовок, подписи счётчиков', () => {
    expect(HERO.eyebrowTag).toBe(PRODUCTION_COPY.hero.eyebrowTag);
    expect(HERO.eyebrow).toBe(PRODUCTION_COPY.hero.eyebrow);
    expect(upper([...HERO.titleLines, HERO.titleAccent])).toEqual(PRODUCTION_COPY.hero.title);
    expect(HERO.subtitle).toBe(PRODUCTION_COPY.hero.subtitle);
    expect(Object.values(COUNTER_LABELS)).toEqual(PRODUCTION_COPY.hero.counters);
  });

  it('три шага: рубрика, заголовок, номера, названия и тексты', () => {
    expect(STEPS.eyebrow).toBe(PRODUCTION_COPY.steps.eyebrow);
    expect(STEPS.title.toUpperCase()).toBe(PRODUCTION_COPY.steps.title);
    expect(STEPS.items.map((step) => [step.number, step.title, step.body])).toEqual(
      PRODUCTION_COPY.steps.items,
    );
  });

  it('возможности: рубрика, заголовок, кнопка и работающие плитки по порядку', () => {
    expect(FEATURES.eyebrow).toBe(PRODUCTION_COPY.features.eyebrow);
    expect(upper(FEATURES.titleLines)).toEqual(PRODUCTION_COPY.features.title);
    expect(FEATURES.tryFree).toBe(PRODUCTION_COPY.features.tryFree);
    expect(FEATURES.items.map((item) => [item.title, item.body])).toEqual(
      PRODUCTION_COPY.features.items,
    );
  });

  it('витрина: рубрики и заголовки секций, «Все …», баннер пробного', () => {
    expect(SHOWCASE.clubs.eyebrow).toBe(PRODUCTION_COPY.showcase.clubs.eyebrow);
    expect(upper(SHOWCASE.clubs.titleLines)).toEqual(PRODUCTION_COPY.showcase.clubs.title);
    expect(SHOWCASE.clubs.all).toBe(PRODUCTION_COPY.showcase.clubs.all);
    expect(SHOWCASE.trainers.eyebrow).toBe(PRODUCTION_COPY.showcase.trainers.eyebrow);
    expect(upper(SHOWCASE.trainers.titleLines)).toEqual(PRODUCTION_COPY.showcase.trainers.title);
    expect(SHOWCASE.trainers.all).toBe(PRODUCTION_COPY.showcase.trainers.all);
  });

  it('призыв: рубрика, H2, текст, кнопки, строка под кнопками', () => {
    expect(CTA.eyebrow).toBe(PRODUCTION_COPY.cta.eyebrow);
    expect(upper([...CTA.titleLines, CTA.titleAccent])).toEqual(PRODUCTION_COPY.cta.title);
    expect(CTA.body).toBe(PRODUCTION_COPY.cta.body);
    expect(CTA.primary).toBe(PRODUCTION_COPY.cta.primary);
    expect(CTA.secondary).toBe(PRODUCTION_COPY.cta.secondary);
    expect(CTA.footnote).toBe(PRODUCTION_COPY.cta.footnote);
  });
});
