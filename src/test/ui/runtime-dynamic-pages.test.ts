// Регрессия против статической оптимизации страниц, которые читают живые JSON-данные.
// Phase 26 Step 26.5: корневые `/profile/athlete` и `/profile/provider` превращены
// в redirect-страницы (больше не требуют `force-dynamic`) — проверка их `dynamic`
// убрана. Подмаршруты /profile/*/dashboard/... сохраняют `force-dynamic` и
// могут быть покрыты точечными тестами при необходимости.
import { describe, expect, it } from 'vitest';

import * as BookingPageModule from '@/app/booking/[scheduleId]/page';
import * as ClubDetailPageModule from '@/app/clubs/[slug]/page';
import * as HomePageModule from '@/app/page';
import * as TrainerDetailPageModule from '@/app/trainers/[slug]/page';

describe('runtime dynamic pages', () => {
  it('главная страница отключает статическую оптимизацию для живого каталога', () => {
    expect(HomePageModule.dynamic).toBe('force-dynamic');
  });

  it('detail и booking страницы остаются динамическими после build', () => {
    expect(ClubDetailPageModule.dynamic).toBe('force-dynamic');
    expect(TrainerDetailPageModule.dynamic).toBe('force-dynamic');
    expect(BookingPageModule.dynamic).toBe('force-dynamic');
  });
});
