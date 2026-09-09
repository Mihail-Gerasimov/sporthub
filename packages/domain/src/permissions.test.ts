// Тесты словаря прав.
//
// Проверяется не «список не пуст», а свойства, на которых держится вся фаза:
// словарь полон по ролям, наборы не совпадают там, где не должны, и ни одно
// объявленное право не осталось без роли.

import { USER_ROLES } from '@sporthub/types';
import { describe, expect, it } from 'vitest';

import { CAPABILITIES, ROLE_CAPABILITIES, capabilitiesOf, roleCan, rolesWith } from './permissions';

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
    expect(roleCan('athlete', 'manage_own_publications')).toBe(false);
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

  it('вести свои публикации могут обе роли провайдера', () => {
    // Пока наборы совпадают; разделение — отдельный этап фазы, и когда оно случится,
    // покраснеет именно этот тест, а не что-то далёкое.
    expect(rolesWith('manage_own_publications')).toEqual(['trainer', 'club_owner']);
  });

  it('перечисление прав роли совпадает со словарём', () => {
    for (const role of USER_ROLES) {
      expect(new Set(capabilitiesOf(role))).toEqual(ROLE_CAPABILITIES[role]);
    }
  });
});
