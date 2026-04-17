// UI-редактор слотов расписания — переиспользуемый controlled-компонент (Step 13.7, обновлён Step 23.9).
// Рендерит массив слотов, кнопки добавления/удаления, лимит maxSlots, минимум 1.
// Направление — dropdown из выбранных sportIds публикации. Время — с шагом 10 мин.
'use client';

import { useEffect } from 'react';

import type { ScheduleSlotForm } from '@/lib/schemas/publish';
import { Input } from '@/components/ui';

/** Элемент справочника видов спорта (id + name) */
type SportItem = { id: number; name: string };

type ScheduleSlotsEditorProps = {
  slots: ScheduleSlotForm[];
  onChange: (slots: ScheduleSlotForm[]) => void;
  /** Максимальное количество слотов (по умолчанию 3) */
  maxSlots?: number;
  /** ID выбранных видов спорта публикации (фильтр для dropdown направления) */
  sportIds?: number[];
  /** Справочник видов спорта для отображения имён в dropdown */
  sports?: SportItem[];
};

/** Создаёт пустой слот. При одном sportId — auto-select. */
function createEmptySlot(sportIds?: number[]): ScheduleSlotForm {
  return {
    title: '',
    date: '',
    startTime: '',
    endTime: '',
    price: '',
    capacity: '',
    location: '',
    sportId: sportIds?.length === 1 ? sportIds[0] : 0,
  };
}

export function ScheduleSlotsEditor({
  slots,
  onChange,
  maxSlots = 3,
  sportIds = [],
  sports = [],
}: ScheduleSlotsEditorProps) {
  // Виды спорта, доступные для выбора в dropdown (только из sportIds публикации)
  const availableSports = sports.filter((s) => sportIds.includes(s.id));
  const isSingleSport = sportIds.length === 1;

  // Автосинхронизация: при одном sportId — все слоты получают этот sportId
  useEffect(() => {
    if (isSingleSport && sportIds.length === 1) {
      const targetId = sportIds[0];
      const needsUpdate = slots.some((s) => s.sportId !== targetId);
      if (needsUpdate) {
        onChange(slots.map((s) => (s.sportId !== targetId ? { ...s, sportId: targetId } : s)));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSingleSport, sportIds]);

  // Обновление поля внутри конкретного слота
  function updateSlotField(index: number, field: keyof ScheduleSlotForm, value: string | number) {
    const updated = slots.map((slot, i) => (i === index ? { ...slot, [field]: value } : slot));
    onChange(updated);
  }

  // Добавить новый слот
  function addSlot() {
    if (slots.length >= maxSlots) return;
    onChange([...slots, createEmptySlot(sportIds)]);
  }

  // Удалить слот по индексу
  function removeSlot(index: number) {
    if (slots.length <= 1) return;
    onChange(slots.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-4">
      {slots.map((slot, index) => (
        <div key={index} className="rounded-card border border-line bg-canvas p-4">
          {/* Заголовок слота */}
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-ink">Слот {index + 1}</p>
            {slots.length > 1 ? (
              <button
                type="button"
                className="text-xs font-semibold text-red-500 transition-colors hover:text-red-700"
                onClick={() => {
                  removeSlot(index);
                }}
              >
                Удалить
              </button>
            ) : null}
          </div>

          {/* Поля слота */}
          <div className="mt-3 flex flex-col gap-3">
            <Input
              label="Укажите название тренировочного слота"
              placeholder="Например: Тренировка по боксу"
              value={slot.title}
              onChange={(e) => {
                updateSlotField(index, 'title', e.target.value);
              }}
            />

            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                label="Дата"
                type="date"
                value={slot.date}
                onChange={(e) => {
                  updateSlotField(index, 'date', e.target.value);
                }}
              />
              <Input
                label="Начало"
                type="time"
                step="600"
                value={slot.startTime}
                onChange={(e) => {
                  updateSlotField(index, 'startTime', e.target.value);
                }}
              />
              <Input
                label="Окончание"
                type="time"
                step="600"
                value={slot.endTime}
                onChange={(e) => {
                  updateSlotField(index, 'endTime', e.target.value);
                }}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Укажите цену данной тренировки"
                type="number"
                placeholder="500"
                value={slot.price}
                onChange={(e) => {
                  updateSlotField(index, 'price', e.target.value);
                }}
              />
              <Input
                label="Кол-во мест"
                type="number"
                placeholder="10"
                value={slot.capacity}
                onChange={(e) => {
                  updateSlotField(index, 'capacity', e.target.value);
                }}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Место проведения"
                placeholder="Например: Зал №2, Большой ринг, Татами 1"
                value={slot.location}
                onChange={(e) => {
                  updateSlotField(index, 'location', e.target.value);
                }}
              />

              {/* Направление — dropdown из выбранных sportIds публикации */}
              <div className="flex flex-col gap-1">
                <label htmlFor={`slot-sport-${index}`} className="text-sm font-medium text-ink">
                  Направление
                </label>
                <select
                  id={`slot-sport-${index}`}
                  className="rounded-card border border-line bg-canvas px-3 py-2.5 text-sm text-ink transition-colors focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                  value={slot.sportId || ''}
                  disabled={isSingleSport}
                  onChange={(e) => {
                    updateSlotField(index, 'sportId', Number(e.target.value));
                  }}
                >
                  {!isSingleSport && <option value="">Выберите направление</option>}
                  {availableSports.map((sport) => (
                    <option key={sport.id} value={sport.id}>
                      {sport.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      ))}

      {/* Кнопка добавления */}
      {slots.length < maxSlots ? (
        <button
          type="button"
          className="inline-flex w-fit items-center gap-2 rounded-pill border border-dashed border-line bg-panel px-4 py-2.5 text-sm font-semibold text-muted transition-colors hover:border-accent hover:text-accent"
          onClick={addSlot}
        >
          Добавить слот
        </button>
      ) : null}
    </div>
  );
}
