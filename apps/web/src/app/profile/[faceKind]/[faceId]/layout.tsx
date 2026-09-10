// Лейаут кабинета ЛИЦА услуг: `/profile/club/3/*`, `/profile/trainer/7/*`.
//
// ⚠️ Шаг 35.31, и это главное место шага. До него кабинет жил по одному адресу
// на все лица человека — `/profile/provider/*`, — и пускал по правилу «есть
// хотя бы одно лицо». Сверять было нечего: номера лица в адресе не было, и
// `requireOwner` лежал объявленным, но не вызванным ни разу. Владелец трёх
// клубов не мог дать ссылку на кабинет одного из них, а кабинет показывал ему
// три клуба вперемешку.
//
// Теперь номер лица стоит в адресе, и здесь он сверяется со списком лиц
// из сессии. Чужой номер — на главную, ровно тем же ответом, каким встречают
// гостя: чей это клуб и существует ли он вообще, отказ не сообщает.
//
// ⚠️ Порядок обязателен, и он не косметический. Проверка стоит ПЕРЕД загрузкой
// среза: та же проверка строкой ниже дала бы точно такой же редирект в браузере,
// но записи и публикации чужого лица к этому моменту уже уехали бы в поток
// ответа. Ровно это и стережёт отдельный тест в `protected-layouts.test.ts`.
import type { ReactNode } from 'react';

import { redirect } from 'next/navigation';

import { ProfileLayoutShell } from '@/components/profile/ProfileLayoutShell';
import { loadFaceScope } from '@/lib/face-scope';
import type { FaceCabinetParams } from '@/lib/face-cabinet-params';
import { faceCabinet, parseFaceCabinetParams } from '@/lib/service-faces';
import { requireOwner } from '@/lib/session';

export const dynamic = 'force-dynamic';

type FaceCabinetLayoutProps = {
  params: Promise<FaceCabinetParams>;
  children: ReactNode;
};

export default async function FaceCabinetLayout({ children, params }: FaceCabinetLayoutProps) {
  const ref = parseFaceCabinetParams(await params);

  // Мусор в адресе (`/profile/venue/5`, `/profile/club/abc`) — тот же ответ, что
  // и у чужого лица. Отдельного «не найдено» здесь быть не должно: по разнице
  // ответов посторонний перебирал бы номера и узнавал, какие лица существуют.
  if (ref === null) redirect('/');

  // ⚠️ Единственная проверка владения кабинетом, и она серверная. Список лиц
  // приезжает тем же ответом «кто я», которым проверяется вход, — поэтому она
  // укладывается в один запрос и ни одного похода за данными не стоит.
  // ⚠️ Одно решение о доступе, и лицо приходит из него же. Раньше здесь стояли
  // две проверки подряд — сверка владения и поиск лица со своей веткой «уводим», —
  // и вторая маскировала снятие первой: диверсия «убрать `requireOwner`» тестов
  // не покрасила, потому что уводил поиск лица. Искать нечего: сверка и есть поиск.
  const { face } = await requireOwner(ref.kind, ref.id);

  const scope = await loadFaceScope(ref.kind, ref.id);

  return (
    <ProfileLayoutShell cabinet={faceCabinet(face)} hasBookings={scope.bookings.length > 0}>
      {children}
    </ProfileLayoutShell>
  );
}
