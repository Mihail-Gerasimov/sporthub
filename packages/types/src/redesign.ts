import type { EntityId, ISODateTimeString } from './types';

export type Visibility = 'public' | 'followers' | 'private';
export type PostReactionKind = 'like' | 'support' | 'fire';
export type TeamEventStatus = 'scheduled' | 'cancelled' | 'completed';
export type PartnerAdStatus = 'active' | 'closed';
export type ContactRequestStatus = 'pending' | 'accepted' | 'declined';
export type ProductKind = 'physical' | 'digital';
export type ProductStatus = 'draft' | 'published' | 'archived';
export type OrderStatus = 'pending_confirmation' | 'confirmed' | 'cancelled';
export type ProgramType = 'training' | 'nutrition';
export type PassPlanStatus = 'draft' | 'published' | 'archived';
export type SubscriptionStatus = 'active' | 'expired' | 'cancelled';
export type CampaignStatus = 'draft' | 'sent' | 'cancelled';

export interface Page<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
}

export interface SocialPostDto {
  id: EntityId;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
  authorId: EntityId;
  body: string;
  visibility: Visibility;
  imageUrl?: string;
  reactionCount?: number;
  commentCount?: number;
  bookmarked?: boolean;
}

export interface TeamEventDto {
  id: EntityId;
  ownerId: EntityId;
  title: string;
  description: string;
  startsAt: ISODateTimeString;
  endsAt: ISODateTimeString;
  location: string;
  capacity?: number;
  visibility: Visibility;
  status: TeamEventStatus;
}

export interface MarketplaceProductDto {
  id: EntityId;
  sellerId: EntityId;
  categoryId: EntityId;
  name: string;
  description: string;
  price: number;
  kind: ProductKind;
  status: ProductStatus;
  stock?: number;
}

export interface WorkoutExerciseInput {
  name: string;
  sets?: number;
  reps?: number;
  weightKg?: number;
  durationSeconds?: number;
}
