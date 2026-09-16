// Свободные места слота — подпись и порог «мест мало» (шаг 38.81), одно объявление.
//
// Подпись «N мест» со склонением из словаря `PLURAL`, а не своей арифметикой
// остатков (до шага у `SlotCard` была своя копия правила). Порог красной подписи —
// два места, как красная кнопка в макете (`HomePage.tsx:460-470`, эталон step-24):
// карточка слота и строка «Сегодня в фокусе» краснеют с одного числа.
//
// Модуль нейтральный, без `'use client'`: его читают и клиентская карточка слота,
// и серверная карточка героя.

import { countRu, PLURAL } from '@/lib/plural';

/** С этого числа мест и ниже подпись красная: «🔥 2 места» в макете. Наружу — только `isLowSpots`. */
const LOW_SPOTS = 2;

/** Мало ли мест: красная подпись, а не нейтральная. */
export function isLowSpots(availableSpots: number): boolean {
  return availableSpots <= LOW_SPOTS;
}

/** «1 место», «3 места», «10 мест». */
export function spotsLabel(availableSpots: number): string {
  return countRu(availableSpots, PLURAL.places);
}
