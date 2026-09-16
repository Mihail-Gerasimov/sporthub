/**
 * DOM-узел маркера-капли для YMapMarker (шаг 38.80) — по эталону (`App.tsx:1053-1061`):
 * капля 32×40 с белым кругом, цвет — вида спорта из данных, активная — зелёная,
 * крупнее и со свечением. Вёрстка узлами, а не строкой HTML (реестр № 71): имя
 * публикации — данные, в строку HTML их подставлять нельзя.
 *
 * Вид (размер, тень, переход, активное состояние и цвет по умолчанию) — классы
 * `.map-marker-pin` в `globals.css`; здесь только структура и цвет из данных
 * атрибутом `fill`. Атрибут — самое слабое правило: CSS активного состояния его
 * перекрывает, а без атрибута цвет даёт токен.
 */
import type { MapMarkerData } from '@/components/map/useMapMarkers';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Контур капли эталона. */
const DROP_PATH = 'M16 0C7.163 0 0 7.163 0 16c0 12 16 24 16 24S32 28 32 16C32 7.163 24.837 0 16 0z';

/** Класс активного маркера — к нему привязан CSS. */
const ACTIVE_CLASS = 'is-active';

export function createMarkerElement(marker: MapMarkerData): HTMLElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'map-marker-pin';
  el.setAttribute('aria-label', marker.name);
  el.setAttribute('aria-pressed', 'false');

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 32 40');
  svg.setAttribute('aria-hidden', 'true');

  const drop = document.createElementNS(SVG_NS, 'path');
  drop.setAttribute('class', 'map-marker-drop');
  drop.setAttribute('d', DROP_PATH);
  // Цвет вида — из справочника; без него атрибута нет, цвет даёт токен в CSS.
  if (marker.sportColor) drop.setAttribute('fill', marker.sportColor);

  const core = document.createElementNS(SVG_NS, 'circle');
  core.setAttribute('class', 'map-marker-core');
  core.setAttribute('cx', '16');
  core.setAttribute('cy', '16');
  core.setAttribute('r', '7');

  svg.append(drop, core);
  el.append(svg);

  return el;
}

/** Переключить активное состояние капли: класс для CSS и `aria-pressed` для диктора. */
export function setMarkerActive(el: HTMLElement, active: boolean): void {
  el.classList.toggle(ACTIVE_CLASS, active);
  el.setAttribute('aria-pressed', String(active));
}
