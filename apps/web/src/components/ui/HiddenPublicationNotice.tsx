/**
 * Плашка скрытой публикации — на карточке клуба или тренера.
 *
 * Шаг 36.17. Раньше этот компонент рисовался ВМЕСТО карточки: страница отсекала
 * скрытую публикацию по статусу, не разбирая, кто смотрит, и заглушку получали
 * ровно те двое, кому карточка и нужна, — владелец и модератор.
 *
 * Теперь правило видимости живёт на бэкенде: гостю и постороннему скрытой
 * публикации не существует (404), а тому, кто её всё-таки получил, страница рисует
 * карточку целиком и вешает сверху эту плашку. Кнопки «вернуться в каталог» здесь
 * больше нет: читатель плашки не заблудившийся гость, а человек, который может
 * это исправить.
 *
 * ⚠️ Тексты берутся из словарей `@sporthub/domain` по ПРИЗНАКУ вида скрытия
 * (`hiddenKind`), а не по тексту причины. Сравнение причины с константой было
 * не различителем, а совпадением: стоило владельцу вписать ту же строку руками —
 * и на его собственном архиве появлялась плашка «Скрыто модератором».
 */
import {
  HIDE_KIND_LABELS,
  HIDE_KIND_NOTICE,
  HIDE_KIND_SHOWS_REASON,
  isHideKind,
  type HideKind,
} from '@sporthub/domain';

type HiddenPublicationNoticeProps = {
  /** Признак вида скрытия из карточки (`club.hiddenKind` / `trainer.hiddenKind`). */
  kind?: string;
  /** Причина скрытия. Показывается не всегда — решает словарь, а не эта вёрстка. */
  reason?: string;
};

/**
 * Оформление плашки по виду скрытия.
 *
 * Объявлено через `Record<HideKind, …>` намеренно: третий вид скрытия не соберётся,
 * пока ему не дадут оформление. Семантика палитры жёсткая — оранжевый значит
 * «требуется действие» (модерация), нейтральная обводка — «состояние», а не
 * предупреждение (архив владельца).
 */
const HIDE_KIND_TONE: Record<HideKind, string> = {
  owner_archive: 'border-line bg-card-2',
  moderation: 'border-orange bg-orange-soft',
};

export function HiddenPublicationNotice({ kind, reason }: HiddenPublicationNoticeProps) {
  /* Признак из ответа приходит строкой и может быть незнакомым — например, со старого
   * бэкенда без колонки. Тогда считаем скрытием модератором: это единственный вид,
   * который человек не может снять сам, и предложить ему «сохраните карточку» там,
   * где сохранение не поможет, — худшая из двух ошибок. */
  const hideKind: HideKind = isHideKind(kind) ? kind : 'moderation';
  const showsReason =
    HIDE_KIND_SHOWS_REASON[hideKind] && reason !== undefined && reason.trim() !== '';

  return (
    <aside
      data-testid="hidden-publication-notice"
      aria-label="Состояние публикации"
      className="px-4 pt-7 sm:px-6 md:px-8 lg:px-10 lg:pt-8"
    >
      <div
        className={`mx-auto flex max-w-[1440px] flex-col gap-2 rounded-[18px] border px-5 py-4 sm:px-6 sm:py-5 ${HIDE_KIND_TONE[hideKind]}`}
      >
        <p className="font-body text-[11px] font-bold uppercase tracking-[0.22em] text-muted">
          Hidden publication
        </p>
        <h2 className="font-display text-lg uppercase text-ink">{HIDE_KIND_LABELS[hideKind]}</h2>
        <p className="text-sm leading-relaxed text-muted">{HIDE_KIND_NOTICE[hideKind]}</p>
        {showsReason ? (
          <p className="text-sm leading-relaxed text-ink">
            <span className="font-body text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
              Причина:{' '}
            </span>
            {reason}
          </p>
        ) : null}
      </div>
    </aside>
  );
}
