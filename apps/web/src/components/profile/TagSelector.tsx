/**
 * Единый компонент выбора из справочника: «поиск + выбор + крестик».
 * Используется для тегов, удобств, видов спорта, форматов работы и специализаций.
 * Phase 23 — Step 23.6.
 */
'use client';

import { useRef, useState } from 'react';

import type { EntityId } from '@sporthub/types';

export type TagSelectorItem = {
  id: EntityId;
  name: string;
};

type TagSelectorProps = {
  /** Лейбл над компонентом */
  label: string;
  /** Полный список доступных элементов */
  items: TagSelectorItem[];
  /** Массив выбранных id */
  selectedIds: EntityId[];
  /** Callback при изменении выбора */
  onChange: (ids: EntityId[]) => void;
  /** Плейсхолдер поля поиска */
  placeholder?: string;
  /** Мультивыбор (по умолчанию true) */
  multi?: boolean;
  /** Заблокировать компонент */
  disabled?: boolean;
};

export function TagSelector({
  label,
  items,
  selectedIds,
  onChange,
  placeholder = 'Поиск...',
  multi = true,
  disabled = false,
}: TagSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Выбранные элементы для отображения чипов
  const selectedItems = items.filter((item) => selectedIds.includes(item.id));

  // Фильтрация: убираем выбранные + поиск по подстроке
  const normalizedQuery = query.trim().toLocaleLowerCase('ru-RU');
  const availableItems = items.filter((item) => {
    if (selectedIds.includes(item.id)) return false;
    if (normalizedQuery && !item.name.toLocaleLowerCase('ru-RU').includes(normalizedQuery)) {
      return false;
    }
    return true;
  });

  /** Добавить элемент */
  function handleSelect(id: EntityId) {
    if (multi) {
      onChange([...selectedIds, id]);
    } else {
      // Одиночный выбор — замена
      onChange([id]);
    }
    setQuery('');
    setIsOpen(false);
  }

  /** Удалить элемент */
  function handleRemove(id: EntityId) {
    onChange(selectedIds.filter((selectedId) => selectedId !== id));
  }

  /** Открыть dropdown и фокус на input */
  function handleOpen() {
    setIsOpen(true);
    setQuery('');
    // Фокус на input после рендера
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  /** Закрытие по Escape */
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setIsOpen(false);
      setQuery('');
    }
  }

  /** Закрытие при blur вне компонента */
  function handleBlur(e: React.FocusEvent) {
    // Не закрываем если фокус остаётся внутри контейнера
    const container = e.currentTarget;
    requestAnimationFrame(() => {
      if (!container.contains(document.activeElement)) {
        setIsOpen(false);
        setQuery('');
      }
    });
  }

  return (
    <div className="flex flex-col gap-2" onBlur={handleBlur}>
      {/* Лейбл */}
      <span className="text-sm font-semibold text-ink">{label}</span>

      {/* Чипы выбранных элементов */}
      {selectedItems.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedItems.map((item) => (
            <span
              key={item.id}
              className="inline-flex items-center gap-1 rounded-pill border border-line bg-canvas px-2.5 py-1 text-xs text-ink"
            >
              {item.name}
              <button
                type="button"
                aria-label={`Удалить ${item.name}`}
                onClick={() => handleRemove(item.id)}
                disabled={disabled}
                className="ml-0.5 text-muted transition-colors hover:text-danger disabled:opacity-50"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Кнопка «+ Добавить» и dropdown */}
      <div className="relative">
        {!isOpen ? (
          <button
            type="button"
            aria-label="Добавить"
            onClick={handleOpen}
            disabled={disabled}
            className="rounded-pill border border-dashed border-line px-3 py-1.5 text-xs text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
          >
            + Добавить
          </button>
        ) : (
          <div className="flex flex-col">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="rounded-pill border border-line bg-canvas px-3 py-1.5 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
            />

            {/* Dropdown список */}
            <ul
              role="listbox"
              className="mt-1 max-h-40 overflow-y-auto rounded-card border border-line bg-panel shadow-card"
            >
              {availableItems.length > 0 ? (
                availableItems.map((item) => (
                  <li
                    key={item.id}
                    role="option"
                    aria-selected={false}
                    className="cursor-pointer px-3 py-2 text-sm text-ink transition-colors hover:bg-canvas"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSelect(item.id)}
                  >
                    {item.name}
                  </li>
                ))
              ) : (
                <li className="px-3 py-2 text-sm text-muted">
                  Ничего не найдено. Обратитесь к администратору для добавления.
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
