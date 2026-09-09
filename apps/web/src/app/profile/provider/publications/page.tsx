// Phase 25 Step 25.14 → Phase 26 Step 26.4: server page раздела «Мои публикации»
// провайдера. Теперь грузит справочники для edit-bootstrap (sports/tags/amenities/
// specialties/workFormats) — ProviderPublications использует их в модалках
// PublishClubModal/PublishTrainerModal после переноса CRUD из корневого кабинета.
import { ProviderPublications } from '@/components/profile/provider/ProviderPublications';
import {
  getAmenities,
  getClubs,
  getSpecialties,
  getSports,
  getTags,
  getTrainers,
  getWorkFormats,
} from '@/lib/server-api';
import { requireSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function ProviderPublicationsRoute() {
  // Права вошедшего нужны самой странице, а не только навигации: этап Э8a убрал
  // отсюда действия чужого вида — представителю услуг нечего публиковать тренером,
  // тренеру нечего публиковать клубом. Лейаут свои права вниз не передаёт (страницы
  // ему не дети по данным), поэтому спрашиваем «кто я» здесь — как это уже делают
  // страницы уведомлений и расписания.
  const [session, clubs, trainers, sports, tags, amenities, specialties, workFormats] =
    await Promise.all([
      requireSession(),
      getClubs(),
      getTrainers(),
      getSports(),
      getTags(),
      getAmenities(),
      getSpecialties(),
      getWorkFormats(),
    ]);

  return (
    <ProviderPublications
      clubs={clubs}
      trainers={trainers}
      capabilities={session.capabilities}
      sports={sports}
      tags={tags}
      amenities={amenities}
      specialties={specialties}
      workFormats={workFormats}
    />
  );
}
