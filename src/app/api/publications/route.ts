/**
 * GET /api/publications — объединённый список клубов и тренеров для страницы модерации.
 * Поддерживает фильтры (status, type, city, sportId, search) и пагинацию (offset/limit).
 */
import { NextResponse } from 'next/server';

import { getClubs, getTrainers } from '@/lib/db';
import type { Club, Trainer } from '@/types';

/** Нормализованный элемент списка публикаций */
interface PublicationItem {
  id: number;
  name: string;
  type: 'club' | 'trainer';
  city: string;
  sportIds: number[];
  status: string | undefined;
  createdAt: string;
  managedByUserId: number | undefined;
  hideReason?: string;
  hiddenAt?: string;
}

/** Нормализация клуба в PublicationItem */
function clubToItem(club: Club): PublicationItem {
  return {
    id: club.id,
    name: club.name,
    type: 'club',
    city: club.city,
    sportIds: club.sportIds,
    status: club.status,
    createdAt: club.createdAt,
    managedByUserId: club.managedByUserId,
    hideReason: club.hideReason,
    hiddenAt: club.hiddenAt,
  };
}

/** Нормализация тренера в PublicationItem */
function trainerToItem(trainer: Trainer): PublicationItem {
  return {
    id: trainer.id,
    name: trainer.name,
    type: 'trainer',
    city: trainer.city ?? '',
    sportIds: trainer.sportIds,
    status: trainer.status,
    createdAt: trainer.createdAt,
    managedByUserId: trainer.managedByUserId,
    hideReason: trainer.hideReason,
    hiddenAt: trainer.hiddenAt,
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const statusFilter = searchParams.get('status') ?? 'all';
    const typeFilter = searchParams.get('type') ?? 'all';
    const cityFilter = searchParams.get('city') ?? '';
    const sportIdParam = searchParams.get('sportId');
    const sportIdFilter = sportIdParam ? Number(sportIdParam) : null;
    const searchQuery = (searchParams.get('search') ?? '').trim().toLowerCase();
    const offset = Math.max(0, Number(searchParams.get('offset') ?? 0));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? 50)));

    const [clubs, trainers] = await Promise.all([getClubs(), getTrainers()]);

    // Объединяем в единый список
    let items: PublicationItem[] = [];

    if (typeFilter === 'all' || typeFilter === 'club') {
      items.push(...clubs.map(clubToItem));
    }
    if (typeFilter === 'all' || typeFilter === 'trainer') {
      items.push(...trainers.map(trainerToItem));
    }

    // Фильтр по статусу
    if (statusFilter === 'hidden') {
      items = items.filter((item) => item.status === 'hidden');
    } else if (statusFilter === 'published') {
      // published включает undefined (старые данные без явного статуса)
      items = items.filter((item) => item.status !== 'hidden');
    }

    // Фильтр по городу
    if (cityFilter) {
      items = items.filter((item) => item.city === cityFilter);
    }

    // Фильтр по виду спорта
    if (sportIdFilter) {
      items = items.filter((item) => item.sportIds.includes(sportIdFilter));
    }

    // Поиск по названию
    if (searchQuery) {
      items = items.filter((item) => item.name.toLowerCase().includes(searchQuery));
    }

    // Сортировка по дате создания (новые первые)
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const total = items.length;
    const paginated = items.slice(offset, offset + limit);

    return NextResponse.json({
      success: true,
      data: paginated,
      total,
      offset,
      limit,
    });
  } catch (error) {
    console.error('[publications] GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Ошибка при получении списка публикаций' },
      { status: 500 },
    );
  }
}
