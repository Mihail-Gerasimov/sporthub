/* Утилиты для отображения тренеров — палитра градиентов и инициалы */

/* Палитра градиентов для cover-секции тренера (Phase 31: mint-navy в новой палитре) */
export function getCoverPalette(trainerId: number): string {
  const palettes = [
    'from-[#07124F] via-[#50BC93] to-[#BFDFD2]',
    'from-[#07124F] via-[#83D3B5] to-[#D2D8D6]',
    'from-[#50BC93] via-[#83D3B5] to-[#BFDFD2]',
    'from-[#BFDFD2] via-[#50BC93] to-[#07124F]',
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
