/**
 * Генератор стойких паролей для админки (Phase 33, шаг 33.10).
 *
 * Зачем: после перехода на хеширование админ больше не видит чужой пароль —
 * показывать нечего. Взамен он сам выдаёт пароль и один раз видит выданное
 * значение. Разница принципиальная: в руках у админа оказывается пароль,
 * который он только что назначил, а не тот, который человек придумал сам
 * и, возможно, использует ещё в пяти местах.
 *
 * Источник случайности — `crypto.getRandomValues`, а не `Math.random`:
 * последний предсказуем и для паролей не годится.
 */

/**
 * Алфавит без пар, которые путают на слух и на глаз: убраны `l`, `1`, `I`,
 * `0`, `O`. Пароль диктуют по телефону и переписывают руками — «единица или
 * эль» стоит дороже пары бит стойкости.
 *
 * Знаков препинания в алфавите нет намеренно: 16 символов из 58 дают около
 * 93 бит, запас и без них избыточный, а диктовать «звёздочка, амперсанд»
 * втрое дольше.
 */
export const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** Длина по умолчанию. Меньше 16 не выдаём — это нижняя граница, не настройка. */
export const GENERATED_PASSWORD_LENGTH = 16;

/**
 * Выдать стойкий пароль.
 *
 * Отбраковка вместо остатка от деления: `byte % alphabet.length` сделал бы
 * первые символы алфавита чаще остальных. Байты, не попавшие в кратный
 * диапазон, выбрасываются и добираются новые.
 */
export function generatePassword(length: number = GENERATED_PASSWORD_LENGTH): string {
  const size = Math.max(GENERATED_PASSWORD_LENGTH, Math.floor(length));
  const alphabet = PASSWORD_ALPHABET;
  // Наибольшее кратное длине алфавита в пределах байта: всё, что выше, — брак.
  const limit = Math.floor(256 / alphabet.length) * alphabet.length;
  let result = '';

  while (result.length < size) {
    const bytes = new Uint8Array(size - result.length);
    crypto.getRandomValues(bytes);

    for (const byte of bytes) {
      if (byte >= limit) continue;

      result += alphabet[byte % alphabet.length];

      if (result.length === size) break;
    }
  }

  return result;
}
