// Phase 25 Step 25.10: PATCH + DELETE эндпоинты для редактирования/удаления
// конкретной CRM-заметки. Ownership guard: только автор (providerUserId === userId)
// может менять или удалять свою заметку.
import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  deleteProviderClientNote,
  getProviderClientNoteById,
  updateProviderClientNote,
} from '@/lib/db';

const patchSchema = z
  .object({
    userId: z.number().int().positive(),
    note: z.string().trim().min(1).max(2000).optional(),
    bookingId: z.number().int().positive().nullable().optional(),
  })
  .strict();

const deleteSchema = z
  .object({
    userId: z.number().int().positive(),
  })
  .strict();

type RouteContext = { params: Promise<{ id: string }> };

async function resolveNoteId(context: RouteContext): Promise<number | null> {
  const { id } = await context.params;
  const parsed = Number(id);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const noteId = await resolveNoteId(context);
    if (noteId === null) {
      return NextResponse.json({ success: false, error: 'Некорректный id' }, { status: 400 });
    }

    const raw = await request.json();
    const validation = patchSchema.safeParse(raw);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Некорректные данные запроса' },
        { status: 400 },
      );
    }

    const { userId, note: newNote, bookingId } = validation.data;

    const existing = await getProviderClientNoteById(noteId);
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Заметка не найдена' }, { status: 404 });
    }

    if (existing.providerUserId !== userId) {
      return NextResponse.json(
        { success: false, error: 'Недостаточно прав для редактирования заметки' },
        { status: 403 },
      );
    }

    // bookingId: null → удалить привязку; undefined → не трогать; number → поставить.
    const patch: { note?: string; bookingId?: number } = {};
    if (newNote !== undefined) {
      patch.note = newNote;
    }
    if (bookingId !== undefined) {
      patch.bookingId = bookingId ?? undefined;
    }

    const updated = await updateProviderClientNote(noteId, patch);
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Ошибка обновления provider-client-note:', error);
    return NextResponse.json(
      { success: false, error: 'Не удалось обновить заметку' },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const noteId = await resolveNoteId(context);
    if (noteId === null) {
      return NextResponse.json({ success: false, error: 'Некорректный id' }, { status: 400 });
    }

    const raw = await request.json();
    const validation = deleteSchema.safeParse(raw);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Некорректные данные запроса' },
        { status: 400 },
      );
    }

    const { userId } = validation.data;

    const existing = await getProviderClientNoteById(noteId);
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Заметка не найдена' }, { status: 404 });
    }

    if (existing.providerUserId !== userId) {
      return NextResponse.json(
        { success: false, error: 'Недостаточно прав для удаления заметки' },
        { status: 403 },
      );
    }

    await deleteProviderClientNote(noteId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Ошибка удаления provider-client-note:', error);
    return NextResponse.json(
      { success: false, error: 'Не удалось удалить заметку' },
      { status: 500 },
    );
  }
}
