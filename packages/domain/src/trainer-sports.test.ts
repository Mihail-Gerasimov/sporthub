// Тесты согласования двух представлений видов спорта тренера:
// массива `sportIds` и устаревшего одиночного `sportId`.
import { describe, expect, it } from 'vitest';

import { getTrainerPrimarySportId, getTrainerSportIds } from './trainer-sports';

describe('getTrainerSportIds', () => {
  it('возвращает массив, когда он заполнен', () => {
    expect(getTrainerSportIds({ sportIds: [3, 4] })).toEqual([3, 4]);
  });

  it('строит массив из одиночного sportId, когда массива нет', () => {
    expect(getTrainerSportIds({ sportIds: [], sportId: 5 })).toEqual([5]);
  });

  it('возвращает пустой массив, когда видов спорта нет вовсе', () => {
    expect(getTrainerSportIds({ sportIds: [] })).toEqual([]);
  });
});

describe('getTrainerPrimarySportId', () => {
  it('берёт явный sportId, даже если он не первый в массиве', () => {
    expect(getTrainerPrimarySportId({ sportIds: [3, 4], sportId: 4 })).toBe(4);
  });

  it('берёт первый элемент массива, когда явного sportId нет', () => {
    expect(getTrainerPrimarySportId({ sportIds: [3, 4] })).toBe(3);
  });

  it('возвращает undefined, когда видов спорта нет', () => {
    expect(getTrainerPrimarySportId({ sportIds: [] })).toBeUndefined();
  });
});
