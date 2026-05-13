// Phase 24 Step 24.10c: редактор дополнительных услуг тренера (multi-offering).
// Каждая карточка — независимая услуга с attachmentMode (в клубе/частно),
// опциональной привязкой к confirmed TrainerClubLink, ценой/длительностью,
// политикой отмены и собственным блоком расписания.
'use client';

import { Button, Input, Select } from '@/components/ui';
import { ScheduleSlotsEditor } from '@/components/profile/ScheduleSlotsEditor';
import type { TrainerOfferingFormItem } from '@/lib/schemas/publish';
import type { CancellationPolicy, TrainerClubLink } from '@/types';

const OFFERING_FORMATS = ['Индивидуальная', 'Групповая', 'Мини-группа'];

const CANCELLATION_POLICY_OPTIONS: Array<{ value: CancellationPolicy; label: string }> = [
  { value: 'free_anytime', label: 'Бесплатная отмена в любое время' },
  { value: 'free_until_24h', label: 'Бесплатно за 24 часа' },
  { value: 'free_until_2h', label: 'Бесплатно за 2 часа' },
  { value: 'no_refund', label: 'Без возврата' },
];

export interface AdditionalOfferingsEditorProps {
  items: TrainerOfferingFormItem[];
  onChange: (next: TrainerOfferingFormItem[]) => void;
  /** Подтверждённые связи тренера — для select'а клуба при attachmentMode='club'. */
  confirmedLinks: TrainerClubLink[];
  /** Имена клубов для отображения (id → name). */
  clubsById: Map<number, string>;
  /** Справочник видов спорта для schedule-слотов (ScheduleSlotsEditor). */
  sportOptions?: Array<{ id: number; name: string }>;
  /** sportIds тренера — для cross-field валидации ScheduleSlotsEditor. */
  trainerSportIds?: number[];
}

function createEmptyItem(): TrainerOfferingFormItem {
  return {
    title: '',
    description: '',
    format: '',
    price: '',
    duration: '',
    location: '',
    cancellationPolicy: 'free_until_24h',
    attachmentMode: 'private',
    scheduleSlots: [
      {
        title: '',
        date: '',
        startTime: '',
        endTime: '',
        price: '',
        capacity: '',
        location: '',
        sportId: 0,
      },
    ],
  };
}

export function AdditionalOfferingsEditor({
  items,
  onChange,
  confirmedLinks,
  clubsById,
  sportOptions = [],
  trainerSportIds = [],
}: AdditionalOfferingsEditorProps) {
  function updateItem(index: number, patch: Partial<TrainerOfferingFormItem>) {
    const next = items.map((item, idx) => (idx === index ? { ...item, ...patch } : item));
    onChange(next);
  }

  function addItem() {
    onChange([...items, createEmptyItem()]);
  }

  function removeItem(index: number) {
    onChange(items.filter((_, idx) => idx !== index));
  }

  return (
    <div className="flex flex-col gap-4" data-testid="additional-offerings-editor">
      {items.map((item, index) => {
        const clubLinksForTrainer = confirmedLinks;
        return (
          <div
            key={index}
            data-testid={`additional-offering-${index}`}
            className="rounded-card border border-line bg-canvas p-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-ink">Услуга #{index + 2}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  removeItem(index);
                }}
              >
                Удалить
              </Button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={item.attachmentMode === 'private'}
                onClick={() =>
                  updateItem(index, { attachmentMode: 'private', clubLinkId: undefined })
                }
                className={`rounded-pill border px-4 py-1.5 text-sm font-semibold transition-colors ${
                  item.attachmentMode === 'private'
                    ? 'border-accent bg-accent text-ink'
                    : 'border-line text-ink hover:border-accent'
                }`}
              >
                Частно
              </button>
              <button
                type="button"
                aria-pressed={item.attachmentMode === 'club'}
                onClick={() => updateItem(index, { attachmentMode: 'club' })}
                className={`rounded-pill border px-4 py-1.5 text-sm font-semibold transition-colors ${
                  item.attachmentMode === 'club'
                    ? 'border-accent bg-accent text-ink'
                    : 'border-line text-ink hover:border-accent'
                }`}
                disabled={clubLinksForTrainer.length === 0}
              >
                В клубе
              </button>
              {clubLinksForTrainer.length === 0 ? (
                <span className="text-xs text-muted">
                  Для «В клубе» нужна хотя бы одна подтверждённая связь с клубом
                </span>
              ) : null}
            </div>

            {item.attachmentMode === 'club' ? (
              <div className="mt-3">
                <Select
                  value={item.clubLinkId ?? ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    updateItem(index, { clubLinkId: val ? Number(val) : undefined });
                  }}
                >
                  <option value="">Выберите клуб</option>
                  {clubLinksForTrainer.map((link) => (
                    <option key={link.id} value={link.id}>
                      {clubsById.get(link.clubId) ?? `Клуб #${link.clubId}`}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Input
                label="Название услуги"
                value={item.title}
                onChange={(e) => {
                  updateItem(index, { title: e.target.value });
                }}
              />
              <Select
                value={item.format}
                onChange={(e) => {
                  updateItem(index, { format: e.target.value });
                }}
              >
                <option value="">Формат</option>
                {OFFERING_FORMATS.map((fmt) => (
                  <option key={fmt} value={fmt}>
                    {fmt}
                  </option>
                ))}
              </Select>
            </div>

            <div className="mt-3">
              <Input
                label="Описание услуги"
                value={item.description}
                onChange={(e) => {
                  updateItem(index, { description: e.target.value });
                }}
              />
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Input
                label="Цена"
                type="number"
                value={item.price}
                onChange={(e) => {
                  updateItem(index, { price: e.target.value });
                }}
              />
              <Input
                label="Длительность (мин)"
                type="number"
                value={item.duration}
                onChange={(e) => {
                  updateItem(index, { duration: e.target.value });
                }}
              />
              <Input
                label="Место проведения"
                value={item.location}
                onChange={(e) => {
                  updateItem(index, { location: e.target.value });
                }}
              />
            </div>

            <div className="mt-3">
              <label className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                Политика отмены
              </label>
              <Select
                value={item.cancellationPolicy}
                onChange={(e) => {
                  updateItem(index, { cancellationPolicy: e.target.value as CancellationPolicy });
                }}
              >
                {CANCELLATION_POLICY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="mt-4">
              <span className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                Расписание услуги
              </span>
              <ScheduleSlotsEditor
                slots={item.scheduleSlots}
                onChange={(slots) => updateItem(index, { scheduleSlots: slots })}
                sports={sportOptions}
                sportIds={trainerSportIds}
              />
            </div>
          </div>
        );
      })}

      <Button
        variant="outline"
        onClick={() => {
          addItem();
        }}
      >
        + Добавить услугу
      </Button>
    </div>
  );
}
