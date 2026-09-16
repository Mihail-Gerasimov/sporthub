// Русское склонение существительного по числу — одно правило на весь фронт.
//
// До шага 38.53 правило «1 отзыв / 2–4 отзыва / 5+ отзывов» жило десятью копиями
// в четырёх файлах, каждая — своей арифметикой остатков от деления. Здесь формы
// выбирает `Intl.PluralRules` — правило языка, а не ручная проверка «11–14»:
// потребитель называет только три формы слова.

/** Три формы слова: «отзыв», «отзыва», «отзывов». */
export type PluralForms = readonly [one: string, few: string, many: string];

/**
 * Словарь форм — одно объявление на слово. Потребитель называет слово ключом,
 * а не выписывает три формы заново: «отзыв» склонялся трижды в трёх файлах.
 */
export const PLURAL = {
  reviews: ['отзыв', 'отзыва', 'отзывов'],
  clubs: ['клуб', 'клуба', 'клубов'],
  trainers: ['тренер', 'тренера', 'тренеров'],
  directions: ['направление', 'направления', 'направлений'],
  slots: ['слот', 'слота', 'слотов'],
  services: ['услуга', 'услуги', 'услуг'],
  windows: ['окно', 'окна', 'окон'],
  sessions: ['занятие', 'занятия', 'занятий'],
} as const satisfies Record<string, PluralForms>;

const RULES = new Intl.PluralRules('ru-RU');

/** Форма слова для числа: `pluralRu(3, ['окно', 'окна', 'окон'])` → «окна». */
export function pluralRu(count: number, [one, few, many]: PluralForms): string {
  switch (RULES.select(count)) {
    case 'one':
      return one;
    case 'few':
      return few;
    default:
      return many;
  }
}

/** Число вместе со словом: `countRu(21, ['отзыв', 'отзыва', 'отзывов'])` → «21 отзыв». */
export function countRu(count: number, forms: PluralForms): string {
  return `${count} ${pluralRu(count, forms)}`;
}
