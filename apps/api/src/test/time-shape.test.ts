// Проверка сторожа формата меток времени.
//
// Сверка контрактов заменяет значения меток времени заглушкой, иначе тест краснел бы
// на каждом прогоне. Из-за этого она не видела вида записи: строка «2026-08-19T02:38:49.123Z»
// и число 1755567529123 после маскировки становились одним и тем же. Переезд на базу —
// именно тот случай, когда вид записи меняется молча, поэтому вид проверяется отдельно.

import { describe, expect, it } from 'vitest';

import { ISO_TIME_SHAPE, collectTimeShapes, timeShape } from './time-shape';

describe('Вид записи метки времени', () => {
  it('заменяет цифры девятками, оставляя разделители', () => {
    expect(timeShape('2026-08-19T02:38:49.123Z')).toBe('9999-99-99T99:99:99.999Z');
    expect(ISO_TIME_SHAPE).toBe('9999-99-99T99:99:99.999Z');
  });

  it('различает виды записи, которые прежняя маскировка склеивала', () => {
    // Тот же момент времени тремя способами: строка без миллисекунд, число, дата без времени.
    expect(timeShape('2026-08-19T02:38:49Z')).not.toBe(ISO_TIME_SHAPE);
    expect(timeShape(1755567529123)).not.toBe(ISO_TIME_SHAPE);
    expect(timeShape('2026-08-19')).not.toBe(ISO_TIME_SHAPE);
  });

  it('называет вид не-строковых значений', () => {
    expect(timeShape(1755567529123)).toBe('<число>');
    expect(timeShape(null)).toBe('<пусто>');
    expect(timeShape({ toISOString: () => '' })).toBe('<объект>');
  });

  it('собирает виды всех меток вглубь ответа, с путём до каждой', () => {
    const body = {
      success: true,
      data: {
        booking: { id: 1, createdAt: '2026-08-19T02:38:49.123Z' },
        history: [{ at: '2026-08-19T02:38:49.123Z' }, { at: '2026-08-19T02:38:49Z' }],
      },
    };

    expect(collectTimeShapes(body)).toEqual([
      { path: 'data.booking.createdAt', shape: '9999-99-99T99:99:99.999Z' },
      { path: 'data.history[0].at', shape: '9999-99-99T99:99:99.999Z' },
      { path: 'data.history[1].at', shape: '9999-99-99T99:99:99Z' },
    ]);
  });

  it('пропускает отсутствующие метки — их отсутствие проверяет сама сверка', () => {
    expect(collectTimeShapes({ data: { hiddenAt: undefined, id: 1 } })).toEqual([]);
  });

  it('не заглядывает внутрь значения метки — оно уже метка, а не контейнер', () => {
    expect(collectTimeShapes({ at: { createdAt: '2026-08-19T02:38:49.123Z' } })).toEqual([
      { path: 'at', shape: '<объект>' },
    ]);
  });
});
