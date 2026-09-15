/* Утилиты для отображения тренеров — инициалы.
 * Палитра градиентов cover-секции (`getCoverPalette`) снята шагом 38.11: потребителя
 * не было, а несла она 12 сырых цветов. */

/* Инициалы тренера (макс. 2 символа) */
export function getTrainerInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}
