// UI-редактор слотов расписания — переиспользуемый controlled-компонент (Step 13.7).
// Рендерит массив слотов, кнопки добавления/удаления, лимит maxSlots, минимум 1.
'use client';

import type { ScheduleSlotForm } from '@/lib/schemas/publish';
import { Input } from '@/components/ui';

type ScheduleSlotsEditorProps = {
  slots: ScheduleSlotForm[];
  onChange: (slots: ScheduleSlotForm[]) => void;
  /** Максимальное количество слотов (по умолчанию 3) */
  maxSlots?: number;
};

/** Создаёт пустой слот */
function createEmptySlot(): ScheduleSlotForm {
  return {
    title: '',
    date: '',
    startTime: '',
    endTime: '',
    price: '',
    capacity: '',
    location: '',
    discipline: '',
  };
}

export function ScheduleSlotsEditor({ slots, onChange, maxSlots = 3 }: ScheduleSlotsEditorProps) {
  // Обновление поля внутри конкретного слота
  function updateSlotField(index: number, field: keyof ScheduleSlotForm, value: string) {
    const updated = slots.map((slot, i) => (i === index ? { ...slot, [field]: value } : slot));
    onChange(updated);
  }

  // Добавить новый слот
  function addSlot() {
    if (slots.length >= maxSlots) return;
    onChange([...slots, createEmptySlot()]);
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
              label="Название занятия"
              placeholder="Утренняя йога"
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
                value={slot.startTime}
                onChange={(e) => {
                  updateSlotField(index, 'startTime', e.target.value);
                }}
              />
              <Input
                label="Окончание"
                type="time"
                value={slot.endTime}
                onChange={(e) => {
                  updateSlotField(index, 'endTime', e.target.value);
                }}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Цена (₽)"
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
                label="Зал"
                placeholder="Зал №1"
                value={slot.location}
                onChange={(e) => {
                  updateSlotField(index, 'location', e.target.value);
                }}
              />
              <Input
                label="Направление"
                placeholder="Йога"
                value={slot.discipline}
                onChange={(e) => {
                  updateSlotField(index, 'discipline', e.target.value);
                }}
              />
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
