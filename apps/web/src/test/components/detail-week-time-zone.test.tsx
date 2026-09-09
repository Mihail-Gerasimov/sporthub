// Текущая неделя на detail-страницах клуба и тренера (Step 33.11).
//
// Неделя должна считаться по календарю зала: в нём же лежит `slot.date`. Раньше и
// `getCurrentWeekRange`, и вкладки дней в `DetailScheduleWeek` брали «сегодня» из
// `new Date()` с `setHours(0, 0, 0, 0)` — то есть по календарю зрителя. На машине с
// самарским поясом расхождения не видно, поэтому пояс процесса здесь задан явно, а
// момент «сейчас» записан в UTC.
import { render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DetailScheduleWeek,
  type DetailScheduleSlot,
} from '@/components/detail-shared/DetailScheduleWeek';
import { getCurrentWeekRange } from '@/components/detail-shared/utils';

const ORIGINAL_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
process.env.TZ = 'Asia/Tokyo';

afterAll(() => {
  process.env.TZ = ORIGINAL_TIME_ZONE;
});

// 2026-08-23T16:30Z — в зале (Самара) ещё воскресенье 23 августа 20:30,
// а в Токио уже понедельник 24 августа 01:30. Календарь зала и календарь
// зрителя расходятся на сутки, а вместе с ними — и вся неделя.
const NOW = new Date('2026-08-23T16:30:00.000Z');

function makeSlot(overrides: Partial<DetailScheduleSlot> & Pick<DetailScheduleSlot, 'id'>) {
  return {
    date: '2026-08-17',
    title: `Занятие ${overrides.id}`,
    sportName: 'Плавание',
    priceLabel: '900 ₽',
    availableSpots: 5,
    room: 'Зал A',
    sub: '10:00, Марина',
    ...overrides,
  } satisfies DetailScheduleSlot;
}

describe('Текущая неделя detail-страниц (Step 33.11)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('границы недели берутся по календарю зала', () => {
    // Воскресенье 23 августа принадлежит неделе 17–23 августа. По календарю зрителя
    // это уже понедельник — и прежний расчёт отдавал следующую неделю целиком.
    expect(getCurrentWeekRange()).toEqual({
      mondayIso: '2026-08-17',
      sundayIso: '2026-08-23',
    });
  });

  it('вкладки дней покрывают неделю зала, а активна вкладка сегодняшнего дня зала', () => {
    render(
      <DetailScheduleWeek
        slots={[
          makeSlot({ id: 1, date: '2026-08-17' }),
          makeSlot({ id: 2, date: '2026-08-23' }),
          makeSlot({ id: 3, date: '2026-08-23' }),
        ]}
        canAct
        onGuestSlotAction={() => {}}
      />,
    );

    // Счётчики на вкладках подтверждают, что дни недели — те самые, в которых лежат слоты.
    expect(screen.getByRole('tab', { name: 'Пн: 1 слотов' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Вс: 2 слотов' })).toBeInTheDocument();

    // Активен день зала — воскресенье, а не понедельник по часам зрителя.
    const sunday = screen.getByRole('tab', { name: 'Вс: 2 слотов' });
    expect(sunday).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Пн: 1 слотов' })).toHaveAttribute(
      'aria-selected',
      'false',
    );

    // И открыт список слотов именно этого дня.
    expect(screen.getByText('Занятие 2')).toBeInTheDocument();
    expect(screen.getByText('Занятие 3')).toBeInTheDocument();
    expect(screen.queryByText('Занятие 1')).not.toBeInTheDocument();
  });
});
