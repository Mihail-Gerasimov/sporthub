// Phase 25 Step 25.10: CRUD API CRM-заметок провайдера.
// POST /api/provider-client-notes — создание заметки (guard: атлет — клиент провайдера).
// GET /api/provider-client-notes?providerUserId&clientUserId? — список заметок провайдера.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  createProviderClientNote,
  getBookings,
  getClubs,
  getProviderClientNotes,
  getTrainers,
} from '@/lib/db';
import { isClientOfProvider } from '@/lib/provider-client-guards';

const createSchema = z
  .object({
    providerUserId: z.number().int().positive(),
    clientUserId: z.number().int().positive(),
    note: z.string().trim().min(1).max(2000),
    bookingId: z.number().int().positive().optional(),
  })
  .strict();

const listQuerySchema = z.object({
  providerUserId: z.string().regex(/^\d+$/),
  clientUserId: z.string().regex(/^\d+$/).optional(),
});

export async function POST(request: Request) {
  try {
    const raw = await request.json();
    const validation = createSchema.safeParse(raw);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Некорректные данные запроса' },
        { status: 400 },
      );
    }

    const { providerUserId, clientUserId, note, bookingId } = validation.data;

    // Guard ownership: атлет должен быть клиентом провайдера (иметь хоть один booking
    // на managed-сущность). Проверка через in-memory helper, чтобы не плодить обращений к db.
    const [bookings, clubs, trainers] = await Promise.all([
      getBookings(),
      getClubs(),
      getTrainers(),
    ]);
    if (!isClientOfProvider(clientUserId, providerUserId, bookings, clubs, trainers)) {
      return NextResponse.json(
        { success: false, error: 'Этот пользователь не является вашим клиентом' },
        { status: 403 },
      );
    }

    const created = await createProviderClientNote({
      providerUserId,
      clientUserId,
      note,
      bookingId,
    });

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) {
    console.error('Ошибка создания provider-client-note:', error);
    return NextResponse.json(
      { success: false, error: 'Не удалось создать заметку' },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const validation = listQuerySchema.safeParse({
      providerUserId: searchParams.get('providerUserId') ?? undefined,
      clientUserId: searchParams.get('clientUserId') ?? undefined,
    });

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Некорректные параметры запроса' },
        { status: 400 },
      );
    }

    const { providerUserId, clientUserId } = validation.data;

    const notes = await getProviderClientNotes({
      providerUserId: Number(providerUserId),
      clientUserId: clientUserId ? Number(clientUserId) : undefined,
    });

    return NextResponse.json({ success: true, data: notes });
  } catch (error) {
    console.error('Ошибка чтения provider-client-notes:', error);
    return NextResponse.json(
      { success: false, error: 'Не удалось получить заметки' },
      { status: 500 },
    );
  }
}
