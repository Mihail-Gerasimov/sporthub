// Server page раздела «Связи» кабинета лица (Step 25.12).
//
// ⚠️ Шаг 35.31. Связи спрашиваются ПО ЛИЦУ (`?clubId=` либо `?trainerId=`),
// а не все связи площадки с отбором в памяти: кабинет адресный, и выдача обязана
// быть адресной тоже — иначе цена страницы росла бы вместе с числом связей
// всех клубов сразу.
import { ProviderLinks } from '@/components/profile/provider/ProviderLinks';
import { requireFaceCabinetParams, type FaceCabinetParams } from '@/lib/face-cabinet-params';
import {
  faceOwnerQuery,
  getClubs,
  getOfferings,
  getTrainerClubLinks,
  getTrainers,
} from '@/lib/server-api';

export const dynamic = 'force-dynamic';

export default async function FaceLinksRoute({ params }: { params: Promise<FaceCabinetParams> }) {
  const face = await requireFaceCabinetParams(params);
  const [clubs, trainers, offerings, links] = await Promise.all([
    getClubs(),
    getTrainers(),
    getOfferings(),
    getTrainerClubLinks(faceOwnerQuery(face)),
  ]);

  return <ProviderLinks clubs={clubs} trainers={trainers} offerings={offerings} links={links} />;
}
