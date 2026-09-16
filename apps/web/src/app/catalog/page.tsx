// Каталог — рабочая часть площадки (фаза 38, шаг 38.79a): поиск и фильтры, карта,
// выдача, слоты. Переехала с главной как есть по решению заказчика 16.09 (файл фазы,
// 2.1 п. 16): главная — ровно макет, функционал не теряется.
//
// Страница загружает данные ОДИН раз (`loadCatalogData`) и рисует секции ИЗ СЛОВАРЯ
// `lib/catalog-sections.ts` по его порядку. Своей разметки секций у страницы нет:
// секция — запись словаря плюс компонент; секция мимо словаря краснит `anchors-exist`.
//
// Стор фильтров общий с героем главной: «Найти» ведёт сюда с запросом в сторе.
// ⚠️ Принято: при полной перезагрузке страницы фильтры сбрасываются — они живут
// в сторе, а не в адресе; перевод фильтров в адрес — вместе с каталогом в запросе (Д-15).
import { BRAND_NAME } from '@sporthub/domain';
import type { Metadata } from 'next';

import { CATALOG_SECTION_COMPONENTS } from '@/components/catalog/sections';
import { loadCatalogData } from '@/components/catalog/load-catalog-data';
import { HomeContainer } from '@/components/home/HomeContainer';
import { CATALOG_PAGE, CATALOG_SECTION_KEYS } from '@/lib/catalog-sections';

export const metadata: Metadata = {
  title: `${CATALOG_PAGE.title} — ${BRAND_NAME}`,
};

// Каталог читает живые данные после publish/edit/delete владельцев.
export const dynamic = 'force-dynamic';

export default async function CatalogPage() {
  const data = await loadCatalogData(new Date());

  // `<main>` — один, у каркаса (`AppShell`): свой здесь был бы вложенным (a11y, MED).
  return (
    <div className="min-h-screen overflow-x-hidden bg-bg-deep">
      <div className="flex flex-col gap-6 py-6 lg:gap-10 lg:py-10">
        {/* Свой h1 у страницы: секции ниже держат h2, иерархия заголовков цела. */}
        <HomeContainer>
          <h1 className="t-h1 text-ink">{CATALOG_PAGE.title}</h1>
          <p className="mt-3 max-w-2xl font-body text-base leading-relaxed text-muted">
            {CATALOG_PAGE.lede}
          </p>
        </HomeContainer>
        {CATALOG_SECTION_KEYS.map((key) => {
          const Section = CATALOG_SECTION_COMPONENTS[key];

          return <Section key={key} data={data} />;
        })}
      </div>
    </div>
  );
}
