// Серверная страница Dashboard личного кабинета (Step 25.3). Основной маршрут ЛК после
// Phase 26 Step 26.5 — корневой /profile/athlete теперь редиректит сюда.
//
// ⚠️ Шаг 36.30. Здесь же живёт заведение лица услуг: завести клуб или карточку
// тренера — действие ЧЕЛОВЕКА, и место у него одно. Раньше кнопки стояли в разделе
// кабинета лица, куда без лица не попасть, — первое лицо завести было нечем.
// Отсюда и справочники в загрузке: их спрашивают формы публикации.
import { readSession } from '@/lib/session';
import {
  getAmenities,
  getBookingsByUser,
  getClubs,
  getSchedule,
  getSpecialties,
  getSports,
  getTags,
  getTrainers,
  getWorkFormats,
} from '@/lib/server-api';
import { AthleteDashboard } from '@/components/profile/athlete/AthleteDashboard';
import { CreateFaceSection } from '@/components/profile/CreateFaceSection';

export const dynamic = 'force-dynamic';

export default async function AthleteDashboardRoute() {
  // ⚠️ Свой профиль приходит из сессии, и спрашивается он ПЕРВЫМ: от него зависит,
  // чьи записи брать. Раньше страница поднимала СПИСОК ВСЕХ пользователей площадки —
  // с почтами и телефонами — только чтобы найти в нём себя по номеру. После фазы 34
  // тот маршрут под правом администратора, и кабинет на нём падал.
  const viewer = await readSession();
  const athleteUserId = viewer?.id ?? null;

  const [bookings, clubs, schedule, trainers, sports, tags, amenities, specialties, workFormats] =
    await Promise.all([
      athleteUserId === null ? [] : getBookingsByUser(athleteUserId),
      getClubs(),
      getSchedule({ ownerType: 'all' }),
      getTrainers(),
      getSports(),
      getTags(),
      getAmenities(),
      getSpecialties(),
      getWorkFormats(),
    ]);

  return (
    <div className="flex flex-col gap-6">
      <AthleteDashboard bookings={bookings} clubs={clubs} schedule={schedule} trainers={trainers} />
      <CreateFaceSection
        sports={sports}
        tags={tags}
        amenities={amenities}
        specialties={specialties}
        workFormats={workFormats}
      />
    </div>
  );
}
