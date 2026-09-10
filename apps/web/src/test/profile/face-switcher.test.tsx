// Переключатель лица услуг в кабинете (шаги 35.31, 35.32).
//
// ⚠️ Решение 5.3 — ключевое для интерфейса, и проверяется здесь буквально:
// у кого лицо одно, у того выбора НЕТ В РАЗМЕТКЕ ВОВСЕ. Не «спрятан стилями»
// и не «показан неактивным»: большая часть возможных ошибок «сказал не от того
// лица» снимается тем, что большинство людей переключателя никогда не увидят.
//
// ⚠️ Шаг 35.31 изменил не вид переключателя, а его природу. Выбор лица стал
// ПЕРЕХОДОМ: у каждого лица свой адрес, и кабинет другого лица — другая страница
// со своими данными. Поэтому проверяется не «кнопка меняет состояние стора»,
// а «ссылка ведёт по адресу этого лица» — состояния «текущее лицо» в браузере
// больше нет вовсе, и это к лучшему: две правды о том, чей кабинет открыт,
// рано или поздно разъезжаются.
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { CabinetProvider } from '@/components/profile/cabinet-context';
import { FaceSwitcher } from '@/components/profile/FaceSwitcher';
import { PERSONAL_CABINET, faceCabinet, type ServiceFace } from '@/lib/service-faces';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';

const CLUB: ServiceFace = { kind: 'club', id: 3, name: 'CrossFit Garage' };
const CARD: ServiceFace = { kind: 'trainer', id: 7, name: 'Марина Крылова' };

function signIn(faces: ServiceFace[]) {
  useAuthStore.setState({
    ...AUTH_STORE_DEFAULT_STATE,
    user: { id: 2, name: 'Марина Крылова', email: 'marina@studio.local' },
    isAuthenticated: true,
    accountKind: 'person',
    faces,
    status: 'ready',
  });
}

/** Отрисовать переключатель внутри открытого кабинета. */
function renderIn(cabinet: Parameters<typeof CabinetProvider>[0]['cabinet']) {
  return render(
    <CabinetProvider cabinet={cabinet}>
      <FaceSwitcher />
    </CabinetProvider>,
  );
}

describe('FaceSwitcher', () => {
  beforeEach(() => {
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
  });

  it('у человека с одним лицом выбора нет в разметке вовсе', () => {
    signIn([CLUB]);

    const { container } = renderIn(faceCabinet(CLUB));

    expect(container).toBeEmptyDOMElement();
  });

  it('у человека без лиц услуг переключателя тоже нет', () => {
    signIn([]);

    const { container } = renderIn(PERSONAL_CABINET);

    expect(container).toBeEmptyDOMElement();
  });

  it('у человека с двумя лицами показывает оба и отмечает открытый кабинет', () => {
    signIn([CLUB, CARD]);

    renderIn(faceCabinet(CLUB));

    expect(screen.getByTestId('profile-face-switcher')).toBeInTheDocument();
    // Открытый кабинет помечен `aria-current="page"` — тем же признаком, каким
    // помечают текущую страницу в любой навигации. Это и есть правда: он и есть
    // текущая страница.
    expect(screen.getByRole('link', { name: 'CrossFit Garage' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Марина Крылова' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('каждая ссылка ведёт по адресу СВОЕГО лица', () => {
    // ⚠️ Ради этого шаг и делался: у владельца трёх клубов три разных адреса,
    // и ссылкой на кабинет одного из них можно поделиться.
    signIn([CLUB, CARD]);

    renderIn(faceCabinet(CLUB));

    expect(screen.getByRole('link', { name: 'CrossFit Garage' })).toHaveAttribute(
      'href',
      '/profile/club/3',
    );
    expect(screen.getByRole('link', { name: 'Марина Крылова' })).toHaveAttribute(
      'href',
      '/profile/trainer/7',
    );
  });

  it('в личном кабинете открытым не помечено ни одно лицо', () => {
    // Личный кабинет — не лицо. Пометить в нём «текущим» первое попавшееся
    // значило бы соврать о том, от чьего имени человек сейчас действует.
    signIn([CLUB, CARD]);

    renderIn(PERSONAL_CABINET);

    for (const name of ['CrossFit Garage', 'Марина Крылова']) {
      expect(screen.getByRole('link', { name })).not.toHaveAttribute('aria-current');
    }
  });
});
