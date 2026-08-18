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

export const dynamic = 'force-dynamic';

export default async function ProviderPublicationsRoute() {
  const [clubs, trainers, sports, tags, amenities, specialties, workFormats] = await Promise.all([
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
