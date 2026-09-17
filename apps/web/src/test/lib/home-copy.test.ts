// Снимок строк макета: тексты главной — дословно из `prosport/src/app/HomePage.tsx`
// (шаг 38.114, решение заказчика 17.09, Э14).
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

/** Строки макета — `HomePage.tsx`, номера строк на 17.09.2026. */
const DESIGN = {
  hero: {
    eyebrowTag: 'Новинки', // :288
    eyebrow: 'Дневник питания, дневник тренировок и маркет', // :291
    title: ['НАЙДИ ЗАЛ,', 'ЗАПИШИСЬ', 'ЗА 2 МИНУТЫ.'], // :299-301
    subtitle:
      '50+ клубов и 340 тренеров в твоём городе. Онлайн-запись, онлайн-оплата, дневник тренировок и питания — всё в одном месте.', // :306-307
    counters: ['Спортсменов', 'Тренеров', 'Клубов', 'Отзывов'], // :389-390
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
        'Выбери удобное время в расписании, оплати картой или СБП. Без звонков и ожидания.',
      ],
      [
        '03',
        'Тренируйся и расти',
        'Веди дневник тренировок, следи за статистикой, участвуй в челленджах.',
      ],
    ], // :515-520
  },
  features: {
    eyebrow: 'Возможности', // :549
    title: ['ВСЁ, ЧТО НУЖНО', 'СПОРТСМЕНУ'], // :552
    tryFree: 'Попробовать бесплатно', // :560
    items: [
      ['Онлайн-запись', 'Бронируй занятия без звонков — в 2 клика прямо в расписании'],
      ['Онлайн-оплата', 'Оплачивай абонементы и разовые занятия картой или СБП'],
      ['Статистика тренировок', 'Графики активности, личные рекорды, динамика за месяц'],
      ['Дневник тренировок', 'Фиксируй упражнения, веса, повторения — история всегда рядом'],
      ['Дневник питания', 'Считай калории и БЖУ, ставь цели по питанию'],
      ['Прогресс и цели', 'Ставь цели по активности и следи за выполнением'],
      ['Маркет спортпита', 'Спортивное питание с рекомендациями от твоих тренеров'],
      ['Челленджи', 'Принимай вызовы от тренеров и клубов, выигрывай призы'],
    ], // :228-235
  },
  showcase: {
    clubs: { eyebrow: 'Клубы', title: ['ТОПОВЫЕ ЗАЛЫ', 'РЯДОМ С ТОБОЙ'], all: 'Все клубы' }, // :589-601
    trainers: {
      eyebrow: 'Тренеры',
      title: ['СЕРТИФИЦИРОВАННЫЕ', 'ТРЕНЕРЫ'],
      all: 'Все тренеры',
    }, // :638-650
    trial: {
      title: '40% тренеров — первое занятие бесплатно', // :678
      subtitle: 'Попробуй без риска · Отмена за 24 часа', // :680
      cta: 'Тренеры с пробным', // :688
    },
  },
  cta: {
    eyebrow: 'Старт бесплатный', // :853
    title: ['НАЧНИ ТРЕНИРОВАТЬСЯ', 'УМНЕЕ УЖЕ СЕГОДНЯ.'], // :858-859
    body: 'Онлайн-запись, оплата, дневник тренировок и питания — всё это бесплатно. 40% тренеров дают пробное занятие бесплатно.', // :863-864
    primary: 'Создать аккаунт', // :876
    secondary: 'Смотреть клубы', // :886
    footnote: 'Уже 12 000+ спортсменов · 340 тренеров · 52 клуба · Москва и СПб', // :890
  },
} as const;

/** Строки заголовка словаря в регистре макета — капитель даёт CSS. */
const upper = (lines: readonly string[]) => lines.map((line) => line.toUpperCase());

describe('Тексты главной — дословно из макета (38.114)', () => {
  it('герой: плашка, H1, подзаголовок, подписи счётчиков', () => {
    expect(HERO.eyebrowTag).toBe(DESIGN.hero.eyebrowTag);
    expect(HERO.eyebrow).toBe(DESIGN.hero.eyebrow);
    expect(upper([...HERO.titleLines, HERO.titleAccent])).toEqual(DESIGN.hero.title);
    expect(HERO.subtitle).toBe(DESIGN.hero.subtitle);
    expect(Object.values(COUNTER_LABELS)).toEqual(DESIGN.hero.counters);
  });

  it('три шага: рубрика, заголовок, номера, названия и тексты', () => {
    expect(STEPS.eyebrow).toBe(DESIGN.steps.eyebrow);
    expect(STEPS.title.toUpperCase()).toBe(DESIGN.steps.title);
    expect(STEPS.items.map((step) => [step.number, step.title, step.body])).toEqual(
      DESIGN.steps.items,
    );
  });

  it('возможности: рубрика, заголовок, кнопка, восемь плиток по порядку', () => {
    expect(FEATURES.eyebrow).toBe(DESIGN.features.eyebrow);
    expect(upper(FEATURES.titleLines)).toEqual(DESIGN.features.title);
    expect(FEATURES.tryFree).toBe(DESIGN.features.tryFree);
    expect(FEATURES.items.map((item) => [item.title, item.body])).toEqual(DESIGN.features.items);
  });

  it('витрина: рубрики и заголовки секций, «Все …», баннер пробного', () => {
    expect(SHOWCASE.clubs.eyebrow).toBe(DESIGN.showcase.clubs.eyebrow);
    expect(upper(SHOWCASE.clubs.titleLines)).toEqual(DESIGN.showcase.clubs.title);
    expect(SHOWCASE.clubs.all).toBe(DESIGN.showcase.clubs.all);
    expect(SHOWCASE.trainers.eyebrow).toBe(DESIGN.showcase.trainers.eyebrow);
    expect(upper(SHOWCASE.trainers.titleLines)).toEqual(DESIGN.showcase.trainers.title);
    expect(SHOWCASE.trainers.all).toBe(DESIGN.showcase.trainers.all);
    expect(SHOWCASE.trial).toEqual(DESIGN.showcase.trial);
  });

  it('призыв: рубрика, H2, текст, кнопки, строка под кнопками', () => {
    expect(CTA.eyebrow).toBe(DESIGN.cta.eyebrow);
    expect(upper([...CTA.titleLines, CTA.titleAccent])).toEqual(DESIGN.cta.title);
    expect(CTA.body).toBe(DESIGN.cta.body);
    expect(CTA.primary).toBe(DESIGN.cta.primary);
    expect(CTA.secondary).toBe(DESIGN.cta.secondary);
    expect(CTA.footnote).toBe(DESIGN.cta.footnote);
  });
});
