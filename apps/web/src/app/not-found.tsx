// Страница «не найдено».
//
// До фазы 34 её не было вовсе: Next показывал свою служебную заглушку на
// английском, и человек, попавший на несуществующий адрес, видел чужой интерфейс
// вместо нашего.
//
// 38.83: вид — как у `coming-soon` и границы ошибки: рубрика, `t-h1`, `ui/Button`.

import { Button } from '@/components/ui/Button';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-[1440px] flex-col items-start gap-6 px-4 py-16 sm:px-6 lg:px-10">
      <p className="t-eyebrow">Ошибка 404</p>
      <h1 className="t-h1 text-ink">Такой страницы нет</h1>
      <p className="max-w-xl font-body text-base leading-relaxed text-muted">
        Возможно, публикацию удалили или адрес набран с ошибкой.
      </p>
      <Button href="/" variant="secondary">
        На главную
      </Button>
    </main>
  );
}
