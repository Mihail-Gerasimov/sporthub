'use client';

/**
 * Селект тулбара служебной панели — один на все разделы с отбором.
 *
 * Вынесен из `ModerationPage` правкой по ревью 38.54; вторым заходом сюда сведены
 * три копии того же поля — `FilterSelect` из «Пользователей», «Журнала» и «Аналитики»:
 * различались радиусом, подложкой и тем, где стоит подпись.
 *
 * Подпись — одним из двух способов, и ровно одним:
 *   - `label` — видимая подпись над полем, поле обёрнуто в `<label>` (разделы
 *     с фильтрами в карточке);
 *   - `ariaLabel` — подписи на экране нет, её роль играет первый вариант
 *     («Все статусы»), а диктор без имени читал бы шесть одинаковых «списков»
 *     подряд (модерация). Фаза 35 уже ловила дефект, видимый только в дереве
 *     доступности: подпись врала, а на экране всё выглядело правильно.
 *
 * Почему не `ui/Select`: тот — поле ФОРМЫ (высота 48, подпись над полем, состояние
 * ошибки, `focus-within` кольцо), а тулбару нужен компактный отбор с признаком
 * «фильтр применён» (`active` — зелёная обводка и стрелка) и подписью только для
 * диктора. Второй селект в системе — названная цена; сведение в `ui/Select` с этими
 * двумя пропсами — когда у него появится потребитель вне служебной панели.
 */
import { cn } from '@/lib/utils';

type ToolbarSelectProps = {
  value: string;
  active: boolean;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
} & ({ label: string; ariaLabel?: never } | { ariaLabel: string; label?: never });

export function ToolbarSelect({
  label,
  ariaLabel,
  value,
  active,
  disabled = false,
  onChange,
  options,
}: ToolbarSelectProps) {
  const field = (
    <span
      className={cn(
        'relative block rounded-[12px] border bg-card-2 transition-colors focus-within:border-lime',
        active ? 'border-lime' : 'border-line',
      )}
    >
      <select
        aria-label={ariaLabel}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full cursor-pointer appearance-none bg-transparent py-3 pl-3.5 pr-9 text-[13px] font-semibold text-ink outline-none disabled:cursor-not-allowed disabled:opacity-40"
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
          'pointer-events-none absolute right-3.5 top-1/2 inline-block h-2 w-2 -translate-y-[70%] rotate-45 border-b-[1.6px] border-r-[1.6px] transition-colors',
          active ? 'border-lime' : 'border-muted',
        )}
      />
    </span>
  );

  if (label === undefined) return field;

  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted">{label}</span>
      {field}
    </label>
  );
}
