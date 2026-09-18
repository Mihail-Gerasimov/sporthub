import type { Metadata } from 'next';

import { SocialFeedClient } from '@/components/features/SocialFeedClient';

export const metadata: Metadata = { title: 'Лента — ПРОСПОРТ' };

export default function FeedPage() {
  return <SocialFeedClient />;
}
