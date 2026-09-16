// Стрелка «влево / вправо» — одна иконка на стрелки карусели (`CardSlider`) и
// постраничности (`PaginationBar`); прежде путь `M15 6l-6 6 6 6` жил четырьмя копиями.
// Декоративная: подпись несёт кнопка. Размер и толщина — по месту.

type ChevronIconProps = {
  direction: 'left' | 'right';
  /** Класс размера (`size-4`, `size-3.5`) — у кнопок карусели и постраничности он разный. */
  className?: string;
  strokeWidth?: number;
};

const PATHS: Record<ChevronIconProps['direction'], string> = {
  left: 'M15 6l-6 6 6 6',
  right: 'M9 6l6 6-6 6',
};

export function ChevronIcon({
  direction,
  className = 'size-4',
  strokeWidth = 2,
}: ChevronIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={PATHS[direction]} />
    </svg>
  );
}
