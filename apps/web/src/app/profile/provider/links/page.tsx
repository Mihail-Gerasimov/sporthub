// Server page раздела Links провайдера (Step 25.12). Параллельный маршрут к корню
// /profile/provider. Грузит clubs/trainers/offerings + все trainer-club-links одной
// пачкой. Клиент сам фильтрует релевантные связи по managed-сущностям.
import { ProviderLinks } from '@/components/profile/provider/ProviderLinks';
import { getClubs, getOfferings, getTrainerClubLinks, getTrainers } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function ProviderLinksRoute() {
  const [clubs, trainers, offerings, links] = await Promise.all([
    getClubs(),
    getTrainers(),
    getOfferings(),
    getTrainerClubLinks(),
  ]);

  return <ProviderLinks clubs={clubs} trainers={trainers} offerings={offerings} links={links} />;
}
