// Главная — витрина и рабочая часть (фаза 38, шаг 38.66): страница загружает данные
// дня ОДИН раз и рисует секции ИЗ СЛОВАРЯ `lib/home-sections.ts` по его порядку.
// Своей разметки секций у страницы нет: секция главной — запись словаря плюс
// компонент; секция мимо словаря краснит сторож `anchors-exist` (диверсия д-28).
//
// Данные: витринные вызовы — с `limit` и порядком в запросе (лидеры — `sort=rating&limit=1`,
// шаг 38.31); полный каталог — для РАБОЧЕЙ части (`loadCatalogData`, общий с `/catalog`):
// поиск, карта и слоты фильтруют в памяти по построению (действующее ограничение, Д-15).
//
// Карта: внутренняя логика `MapSection` (Yandex Maps, фаза 19) не трогается.
import { buildCatalogData, fetchCatalogSources } from '@/components/catalog/load-catalog-data';
import { loadHomeData } from '@/components/home/load-home-data';
import { HOME_SECTION_COMPONENTS } from '@/components/home/sections';
import type { HomeData } from '@/components/home/home-data';
import { HOME_SECTION_KEYS } from '@/lib/home-sections';
import { getPublishedClubs, getPublishedTrainers } from '@/lib/server-api';

// Витрина читает живые JSON-данные после publish/edit/delete провайдеров.
export const dynamic = 'force-dynamic';

export default async function Home() {
  // Момент передаётся явно: один на день и на отбор занятий (38.81).
  const now = new Date();
  // ⚠️ 38.79a: данные рабочей части — общим загрузчиком с `/catalog`, пока её секции
  // ещё стоят и на главной; шаг 38.79b оставит витрине только своё.
  const sources = await fetchCatalogSources();
  const catalog = buildCatalogData(sources, now);
  const [
    showcase,
    // Лидеры каталога — запросом (шаг 38.31): лучший по рейтингу, при равенстве —
    // по числу отзывов, ничьи разводит номер. Пришли отсортированными и обрезанными
    // базой — берётся первая строка.
    [featuredClub],
    [featuredTrainer],
  ] = await Promise.all([
    loadHomeData({ now, catalog, references: sources }),
    getPublishedClubs({ sort: 'rating', limit: 1 }),
    getPublishedTrainers({ sort: 'rating', limit: 1 }),
  ]);

  // Подпись услуги лидера — из справочника тренеров (у него свой отсев: без адреса
  // и координат тренер туда не попадает), иначе биография.
  const featuredTrainerTitle =
    catalog.trainerDirectory.find((item) => item.id === featuredTrainer?.id)
      ?.primaryOfferingTitle ?? featuredTrainer?.bio;

  const data: HomeData = { ...showcase, featuredClub, featuredTrainer, featuredTrainerTitle };

  // Ни полей, ни потолка у `main`: герой и призыв — во всю ширину, как в эталоне;
  // контейнер — у каждой секции свой (`HomeContainer` у рабочей части и лидеров).
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
