// API городов: публичный read-only список для клиентских компонентов.
import { NextResponse } from 'next/server';

import { getCities } from '@/lib/db';

export async function GET() {
  try {
    const cities = await getCities();

    return NextResponse.json({ success: true, data: cities });
  } catch (error) {
    console.error('Ошибка получения городов:', error);

    return NextResponse.json(
      { success: false, error: 'Не удалось получить список городов' },
      { status: 500 },
    );
  }
}
