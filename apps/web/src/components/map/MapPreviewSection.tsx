/**
 * Блок-placeholder карты на homepage.
 * Карта будет подключена позже (Яндекс.Карты / 2GIS).
 * Маркеры, фильтр-интеграция и интерактив убраны — остался визуальный контейнер.
 */
export function MapPreviewSection() {
  return (
    <section id="results" className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">Map</p>
        <h2 className="mt-2 text-2xl font-semibold text-ink">Карта</h2>
      </div>

      <div
        data-testid="map-placeholder"
        className="flex min-h-[20rem] items-center justify-center rounded-card border border-dashed border-line bg-canvas sm:min-h-[24rem] lg:min-h-[28rem]"
      >
        <p className="text-base font-medium text-muted">Карта — скоро здесь</p>
      </div>
    </section>
  );
}
