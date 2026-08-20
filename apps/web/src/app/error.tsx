'use client';

// Граница ошибки страниц.
//
// До фазы 33 сбой запроса к бэкенду глушился: серверный клиент возвращал пустой
// массив, страница отдавала код 200 и выглядела так, будто на сайте просто ничего
// нет. Пользователь читал это как «клубов нет», а не «сервис недоступен»;
// в фазе 32 именно так пустая страница дожила до боевого сервера.
//
// Теперь сбой доходит сюда, и страница говорит правду.

import { useEffect } from 'react';

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    // В журнал сервера — с текстом и отпечатком, чтобы найти конкретный запрос.
    console.error('[web] страница не собралась:', error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-2xl font-semibold text-ink sm:text-3xl">Сервис временно недоступен</h1>

      <p className="text-base text-muted">
        Не удалось получить данные. Это сбой на нашей стороне, а не пустой каталог — попробуйте
        обновить страницу через минуту.
      </p>

      <button
        type="button"
        onClick={reset}
        className="rounded-full bg-accent px-6 py-3 text-base font-medium text-ink transition hover:opacity-90"
      >
        Попробовать снова
      </button>

      {error.digest ? <p className="text-sm text-muted">Код обращения: {error.digest}</p> : null}
    </main>
  );
}
