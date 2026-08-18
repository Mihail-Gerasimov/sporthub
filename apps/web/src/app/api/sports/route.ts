import { NextResponse } from 'next/server';

import { getSports } from '@/lib/db';

export async function GET() {
  try {
    const sports = await getSports();

    return NextResponse.json({
      success: true,
      data: sports,
    });
  } catch (error) {
    console.error('Ошибка получения видов спорта:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Не удалось получить список видов спорта',
      },
      { status: 500 },
    );
  }
}
