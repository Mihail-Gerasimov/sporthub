// Главная — витрина ровно по макету (фаза 38, шаги 38.66 и 38.79b): герой → как это
// работает → возможности → «Клубы» → «Тренеры» → призыв. Ниже призыва ничего нет.
// Рабочая часть — поиск и фильтры, карта, выдача, слоты — на `/catalog` (решение
// заказчика 16.09, файл фазы 2.1 п. 16), «Лидеры каталога» сняты (38.79c).
//
// Страница загружает данные дня ОДИН раз (`loadHomeData`) и рисует секции ИЗ СЛОВАРЯ
// `lib/home-sections.ts` по его порядку. Своей разметки секций у страницы нет:
// секция главной — запись словаря плюс компонент; секция мимо словаря краснит
// сторож `anchors-exist` (диверсия д-28).
//
// Данные — витринные вызовы с `limit` и порядком в запросе (шесть клубов, четыре
// тренера, `sort=rating`), сводка счётчиков — четырьмя `count`; полный список
// клубов — для «Сегодня в фокусе» и площадок тренеров (см. `load-home-data.ts`).
import { loadHomeData } from '@/components/home/load-home-data';
import { HOME_SECTION_COMPONENTS } from '@/components/home/sections';
import { HOME_SECTION_KEYS } from '@/lib/home-sections';

// Витрина читает живые данные после publish/edit/delete владельцев.
export const dynamic = 'force-dynamic';

export default async function Home() {
  // Момент передаётся явно: один на день и на отбор занятий (38.81).
  const data = await loadHomeData(new Date());

  // Ни полей, ни потолка у `main`: герой и призыв — во всю ширину, как в эталоне;
  // контейнер — у каждой секции свой (`HomeContainer` у каруселей).
  return (
    <main className="min-h-screen overflow-x-hidden bg-bg-deep">
      <div className="flex flex-col gap-6 pb-10 lg:gap-10">
        {HOME_SECTION_KEYS.map((key) => {
          const Section = HOME_SECTION_COMPONENTS[key];

          return <Section key={key} data={data} />;
        })}
      </div>
    </main>
  );
}
