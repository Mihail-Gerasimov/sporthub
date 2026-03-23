/* Утилиты для отображения тренеров — палитра градиентов и инициалы */

/* Палитра градиентов для cover-секции тренера */
export function getCoverPalette(trainerId: number): string {
  const palettes = [
    'from-[#113d45] via-[#1d6c74] to-[#f1d2af]',
    'from-[#713321] via-[#d17a4f] to-[#f4dfc4]',
    'from-[#16363f] via-[#5f918f] to-[#efe3ca]',
    'from-[#3e4f56] via-[#d06f4a] to-[#f4d8bb]',
  ];

  return palettes[trainerId % palettes.length];
}

/* Инициалы тренера (макс. 2 символа) */
export function getTrainerInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}
