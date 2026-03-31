// Регрессия против статической оптимизации страниц, которые читают живые JSON-данные.
import { describe, expect, it } from 'vitest';

import * as BookingPageModule from '@/app/booking/[scheduleId]/page';
import * as ClubDetailPageModule from '@/app/clubs/[slug]/page';
import * as HomePageModule from '@/app/page';
import * as AthleteProfilePageModule from '@/app/profile/athlete/page';
import * as ProviderProfilePageModule from '@/app/profile/provider/page';
import * as TrainerDetailPageModule from '@/app/trainers/[slug]/page';

describe('runtime dynamic pages', () => {
  it('главная страница отключает статическую оптимизацию для живого каталога', () => {
    expect(HomePageModule.dynamic).toBe('force-dynamic');
  });

  it('кабинеты отключают статическую оптимизацию для актуальных JSON-данных', () => {
    expect(AthleteProfilePageModule.dynamic).toBe('force-dynamic');
    expect(ProviderProfilePageModule.dynamic).toBe('force-dynamic');
  });

  it('detail и booking страницы остаются динамическими после build', () => {
    expect(ClubDetailPageModule.dynamic).toBe('force-dynamic');
    expect(TrainerDetailPageModule.dynamic).toBe('force-dynamic');
    expect(BookingPageModule.dynamic).toBe('force-dynamic');
  });
});
