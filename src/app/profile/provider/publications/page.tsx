// Phase 25 Step 25.14: server page раздела «Мои публикации» провайдера.
import { ProviderPublications } from '@/components/profile/provider/ProviderPublications';
import { getClubs, getTrainers } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function ProviderPublicationsRoute() {
  const [clubs, trainers] = await Promise.all([getClubs(), getTrainers()]);
  return <ProviderPublications clubs={clubs} trainers={trainers} />;
}
