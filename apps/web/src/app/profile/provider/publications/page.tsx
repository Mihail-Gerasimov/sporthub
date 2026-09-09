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
  // ⚠️ Шаг 35.34. Права вошедшего странице больше не нужны: раздел показывает
  // то, чем человек ВЛАДЕЕТ, а владение видно из самого каталога. Проверка входа
  // остаётся — и остаётся ДО похода за данными, иначе гость получил бы каталог
  // в потоке ответа.
  const [, clubs, trainers, sports, tags, amenities, specialties, workFormats] = await Promise.all([
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
      sports={sports}
      tags={tags}
      amenities={amenities}
      specialties={specialties}
      workFormats={workFormats}
    />
  );
}
