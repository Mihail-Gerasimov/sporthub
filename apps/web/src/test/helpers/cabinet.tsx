// Отрисовка раздела кабинета ЛИЦА в тестах.
//
// ⚠️ Зачем помощник. Разделы кабинета лица отбирают свои данные по лицу открытого
// кабинета (`useCabinetFaces`), а не по всем лицам человека. Без провайдера кабинета
// хук отдаёт пустой список — то есть тест проверял бы раздел, которому нечего
// показывать, и был бы зелёным по чужой причине.
//
// В бою такого не бывает: раздел лица живёт только внутри `/profile/<вид>/<номер>/*`,
// и лейаут кладёт лицо в контекст до отрисовки. Помощник это и воспроизводит.
//
// ⚠️ Номер лица — не украшение. Кабинет отдаёт РОВНО ОДНО лицо, и раздел покажет
// клуб из набора данных только если номер кабинета совпал с номером этого клуба.
// Поэтому у набора с клубом 10 или карточкой тренера 5 лицо передаётся вторым
// параметром: умолчание (клуб 1) им не подходит и молча даст пустой раздел.
import type { ReactElement } from 'react';

import { CabinetProvider } from '@/components/profile/cabinet-context';
import { PERSONAL_CABINET, faceCabinet, type ServiceFace } from '@/lib/service-faces';
import { renderWithToast } from '@/test/helpers/render-with-toast';

/** Лицо по умолчанию: клуб 1 — им владеет пользователь 2 в фикстурах. */
export const TEST_CLUB_FACE: ServiceFace = { kind: 'club', id: 1, name: 'Клуб 1' };

/** Лицо-клуб с нужным номером: номер обязан совпасть с клубом набора данных теста. */
export function clubFace(id: number, name = `Клуб ${id}`): ServiceFace {
  return { kind: 'club', id, name };
}

/** Лицо-карточка тренера с нужным номером — для разделов, проверяющих сторону тренера. */
export function trainerFace(id: number, name = `Тренер ${id}`): ServiceFace {
  return { kind: 'trainer', id, name };
}

/**
 * Отрисовать раздел внутри кабинета названного лица.
 *
 * ⚠️ Стек toast'ов монтируется всегда, и это не «на всякий случай»: разделы лица
 * отвечают на действия именно toast'ом (`role="status"`), а собственного контейнера
 * у них нет — он глобальный. Без него проверка сообщения падала бы не потому, что
 * сообщения нет, а потому, что его негде показать. Пустой стек в DOM ничего не
 * рисует, поэтому разделам без действий он не мешает.
 */
export function renderInFaceCabinet(node: ReactElement, face: ServiceFace = TEST_CLUB_FACE) {
  return renderWithToast(<CabinetProvider cabinet={faceCabinet(face)}>{node}</CabinetProvider>);
}

/** Отрисовать раздел внутри ЛИЧНОГО кабинета — там лиц нет по определению. */
export function renderInPersonalCabinet(node: ReactElement) {
  return renderWithToast(<CabinetProvider cabinet={PERSONAL_CABINET}>{node}</CabinetProvider>);
}
