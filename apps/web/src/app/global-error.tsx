'use client';

// Граница ошибок верхнего уровня.
//
// ⚠️ Отличается от `error.tsx` тем, что перехватывает сбой САМОГО корневого
// макета — когда обычная граница ещё не смонтирована. Поэтому здесь свои
// `<html>` и `<body>`: подставить их больше некому, и без них страница
// не отрисуется вовсе.
//
// До фазы 34 файла не было: такой сбой показывал служебный экран Next
// на английском.

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="ru">
      <body className="flex min-h-screen flex-col items-center justify-center gap-6 bg-white px-4 text-center">
        <h1 className="font-display text-[clamp(1.5rem,5vw,2.25rem)] leading-tight text-ink">
          Что-то пошло не так
        </h1>
        <p className="max-w-[46ch] text-[15px] leading-relaxed text-muted">
          Страница не смогла загрузиться. Попробуйте обновить — если не поможет, зайдите позже.
        </p>
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-full bg-lime px-6 py-3 text-[13px] font-bold uppercase tracking-[0.12em] text-ink transition-colors hover:bg-lime-hov"
        >
          Обновить
        </button>
      </body>
    </html>
  );
}
