'use client';

export type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  error?: string;
};

export async function clientApi<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const payload = (await response.json()) as ApiEnvelope<T>;

  if (!response.ok || !payload.success) {
    throw new Error(payload.error || 'Не удалось выполнить запрос');
  }

  return payload.data;
}
