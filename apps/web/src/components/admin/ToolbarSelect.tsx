'use client';

/**
 * Селект тулбара служебной панели — общий для разделов с отбором в адресе.
 *
 * Вынесен из `ModerationPage` правкой по ревью 38.54: страница подошла к потолку строк,
 * а сам селект — не про модерацию. У `Dashboard` и `Logs` живут свои копии того же
 * поля (`FilterSelect`); свести их сюда — при переписывании тех разделов.
 */
import { cn } from '@/lib/utils';

/**
 * Селект тулбара.
 *
 * ⚠️ `ariaLabel` обязателен. Видимой подписи у селекта нет — её роль играет
 * первый вариант («Все статусы»), и экранный диктор читал бы пять одинаковых
 * «списков» подряд. Фаза 35 уже ловила дефект, видимый только в дереве
 * доступности: подпись врала, а на экране всё выглядело правильно.
 */
export function ToolbarSelect({
  ariaLabel,
  value,
  active,
  onChange,
  options,
}: {
  ariaLabel: string;
  value: string;
  active: boolean;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <span
      className={cn(
        'relative block rounded-[14px] border bg-card-2 transition-colors focus-within:border-lime',
        active ? 'border-lime' : 'border-line',
      )}
    >
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full cursor-pointer appearance-none bg-transparent py-3.5 pl-4 pr-9 text-[13px] font-semibold text-ink outline-none"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute right-4 top-1/2 inline-block h-2 w-2 -translate-y-[70%] rotate-45 border-b-[1.6px] border-r-[1.6px] transition-colors',
          active ? 'border-lime' : 'border-muted',
        )}
      />
    </span>
  );
}
