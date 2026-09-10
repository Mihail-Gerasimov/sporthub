// Server page раздела «Отзывы» кабинета лица (Phase 25 Step 25.14).
//
// ⚠️ Шаг 35.31. Отзывы спрашиваются ПО ЛИЦУ, а не выдачей всей площадки с отбором
// в памяти: адресный маршрут поверх выдачи площадки — это адресный URL, а не
// адресный запрос.
import { ProviderReviews } from '@/components/profile/provider/ProviderReviews';
import { requireFaceCabinetParams, type FaceCabinetParams } from '@/lib/face-cabinet-params';
import { faceOwnerQuery, getClubs, getReviews, getTrainers } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

export default async function FaceReviewsRoute({ params }: { params: Promise<FaceCabinetParams> }) {
  const face = await requireFaceCabinetParams(params);
  const [reviews, clubs, trainers] = await Promise.all([
    getReviews(faceOwnerQuery(face)),
    getClubs(),
    getTrainers(),
  ]);

  return <ProviderReviews reviews={reviews} clubs={clubs} trainers={trainers} />;
}
