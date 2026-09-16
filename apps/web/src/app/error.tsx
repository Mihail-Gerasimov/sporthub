'use client';

// Граница ошибки страниц.
//
// До фазы 33 сбой запроса к бэкенду глушился: серверный клиент возвращал пустой
// массив, страница отдавала код 200 и выглядела так, будто на сайте просто ничего
// нет. Пользователь читал это как «клубов нет», а не «сервис недоступен»;
// в фазе 32 именно так пустая страница дожила до боевого сервера.
//
// Теперь сбой доходит сюда, и страница говорит правду.
//
// 38.83: вид — как у страниц фазы 38 (`coming-soon`, «не найдено»): рубрика,
// заголовок шкалы `t-h1`, кнопка — `ui/Button`; слова прежние.

import { useEffect } from 'react';

import { Button } from '@/components/ui/Button';

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
    <main className="mx-auto flex min-h-[60vh] w-full max-w-[1440px] flex-col items-start gap-6 px-4 py-16 sm:px-6 lg:px-10">
      <p className="t-eyebrow">Сбой</p>
      <h1 className="t-h1 text-ink">Сервис временно недоступен</h1>
      <p className="max-w-xl font-body text-base leading-relaxed text-muted">
        Не удалось получить данные. Это сбой на нашей стороне, а не пустой каталог — попробуйте
        обновить страницу через минуту.
      </p>
      <Button onClick={reset}>Попробовать снова</Button>
      {error.digest ? (
        <p className="font-body text-sm text-muted">Код обращения: {error.digest}</p>
      ) : null}
    </main>
  );
}
