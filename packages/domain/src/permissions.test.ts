// Тесты словаря прав.
//
// Проверяется не «список не пуст», а свойства, на которых держится вся фаза:
// словарь полон по ролям, наборы не совпадают там, где не должны, и ни одно
// объявленное право не осталось без роли.

import { USER_ROLES } from '@sporthub/types';
import { describe, expect, it } from 'vitest';

import {
  CAPABILITIES,
  ROLE_CAPABILITIES,
  capabilitiesOf,
  hasCapability,
  roleCan,
  rolesWith,
} from './permissions';

describe('Права ролей', () => {
  it('словарь полон: у каждой роли есть набор', () => {
    // Полноту держит и тип, но роль можно объявить с пустым набором и не заметить.
    for (const role of USER_ROLES) {
      expect(ROLE_CAPABILITIES[role].size).toBeGreaterThan(0);
    }
  });

  it('каждое объявленное право принадлежит хотя бы одной роли', () => {
    // Право без роли — мёртвая строка: защищённый им маршрут не откроется никому,
    // и понять это можно будет только на проде.
    const orphans = CAPABILITIES.filter((capability) => rolesWith(capability).length === 0);

    expect(orphans).toEqual([]);
  });

  it('спортсмен не управляет чужими публикациями и не модерирует', () => {
    expect(roleCan('athlete', 'manage_own_clubs')).toBe(false);
    expect(roleCan('athlete', 'manage_own_trainer_profile')).toBe(false);
    expect(roleCan('athlete', 'moderate_publications')).toBe(false);
    expect(roleCan('athlete', 'view_platform_logs')).toBe(false);
  });

  it('провайдер не получает админских прав', () => {
    for (const role of ['club_owner', 'trainer'] as const) {
      expect(roleCan(role, 'manage_any_user')).toBe(false);
      expect(roleCan(role, 'impersonate')).toBe(false);
      expect(roleCan(role, 'use_admin_tools')).toBe(false);
      expect(roleCan(role, 'view_analytics')).toBe(false);
    }
  });

  it('администратор не записывается на занятия и не пишет отзывы', () => {
    // Это действия клиента площадки: админской учётке они не нужны, а выданные
    // «на всякий случай» права размывают смысл роли.
    expect(roleCan('admin', 'book_sessions')).toBe(false);
    expect(roleCan('admin', 'write_reviews')).toBe(false);
  });

  it('администратор один имеет доступ к служебным разделам', () => {
    expect(rolesWith('view_platform_logs')).toEqual(['admin']);
    expect(rolesWith('view_analytics')).toEqual(['admin']);
    expect(rolesWith('moderate_publications')).toEqual(['admin']);
    expect(rolesWith('impersonate')).toEqual(['admin']);
  });

  it('записываться может только спортсмен', () => {
    expect(rolesWith('book_sessions')).toEqual(['athlete']);
  });

  it('клубы ведёт только представитель услуг, свою карточку — только тренер', () => {
    // Решение заказчика от 08.09.2026: тренер не публикует клуб, представитель
    // услуг не публикуется тренером. Это и есть суть разделения — всё остальное
    // (маршруты, кабинет, чек-лист) следует за этими двумя строками.
    expect(rolesWith('manage_own_clubs')).toEqual(['club_owner']);
    expect(rolesWith('manage_own_trainer_profile')).toEqual(['trainer']);
  });

  it('наборы двух ролей провайдера различаются ровно правом на публикацию', () => {
    // Сверка идёт разностью множеств, а не перечислением: список общих прав
    // будет расти, и тест, выписанный целиком, пришлось бы править на каждое
    // добавление — то есть он ловил бы не разделение ролей, а сам себя.
    const clubOwner = new Set(capabilitiesOf('club_owner'));
    const trainer = new Set(capabilitiesOf('trainer'));
    const onlyClubOwner = [...clubOwner].filter((capability) => !trainer.has(capability));
    const onlyTrainer = [...trainer].filter((capability) => !clubOwner.has(capability));

    expect(onlyClubOwner).toEqual(['manage_own_clubs']);
    expect(onlyTrainer).toEqual(['manage_own_trainer_profile']);
  });

  it('записи, связи и клиенты остаются общими для обеих ролей провайдера', () => {
    // Разделение не должно расколоть то, что по смыслу площадки общее: и клуб,
    // и тренер разбирают заявки на СВОИ занятия и ведут СВОИХ клиентов.
    for (const capability of [
      'manage_own_bookings',
      'manage_own_links',
      'manage_own_clients',
    ] as const) {
      expect(rolesWith(capability)).toEqual(['trainer', 'club_owner']);
    }
  });

  it('ни у одной роли нет обоих прав на публикацию сразу', () => {
    // Роль, умеющая и то и другое, вернула бы прежнее состояние: «провайдер»
    // как одна роль на два разных занятия.
    for (const role of USER_ROLES) {
      const both = roleCan(role, 'manage_own_clubs') && roleCan(role, 'manage_own_trainer_profile');

      expect(both).toBe(false);
    }
  });

  it('проверка списка прав с сервера читает те же названия, что и словарь', () => {
    // Интерфейс получает права строками; помощник существует, чтобы название
    // права не переписывалось руками на другой стороне.
    const trainer = capabilitiesOf('trainer');

    expect(hasCapability(trainer, 'manage_own_trainer_profile')).toBe(true);
    expect(hasCapability(trainer, 'manage_own_clubs')).toBe(false);
    expect(hasCapability([], 'manage_own_clubs')).toBe(false);
  });

  it('перечисление прав роли совпадает со словарём', () => {
    for (const role of USER_ROLES) {
      expect(new Set(capabilitiesOf(role))).toEqual(ROLE_CAPABILITIES[role]);
    }
  });
});
