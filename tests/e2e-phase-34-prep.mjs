// Подготовка данных прогона — ЧЕРЕЗ ПРОДУКТ, а не вставками в базу.
//
// Публикация клуба и карточки тренера создаёт заодно и слоты расписания: отдельного
// маршрута создания слота в проекте нет, расписание заводится только вместе
// с публикацией. Значит подготовка данных — это и есть проверка бизнес-логики,
// а не обход её.
import { api, futureDate, loginAs } from './e2e-phase-34-harness.mjs';

const COORDS = { lat: 53.195878, lng: 50.100202 };

/** Слот на будущее: чек-лист требует свободных мест и незавершённого занятия. */
function slot(title, days, startTime, endTime, sportId, capacity = '10') {
  return {
    title,
    date: futureDate(days),
    startTime,
    endTime,
    price: '1000',
    capacity,
    location: 'Зал 1',
    sportId,
  };
}

/** Публикация клуба от лица вошедшего представителя услуг. */
export async function publishClub(page, name) {
  const response = await api(page, 'POST', '/api/clubs', {
    name,
    city: 'Самара',
    address: 'ул. Проверочная, 1',
    description: 'Клуб заведён браузерным прогоном чек-листа фазы 34 для проверки прав и владения.',
    phone: '+7 (900) 000-00-01',
    email: 'checklist@sporthub.local',
    priceFrom: '900',
    sportIds: [1],
    tagIds: [],
    amenityIds: [],
    vk: '',
    telegram: '',
    facebook: '',
    coordinates: COORDS,
    cityCoordinates: COORDS,
    scheduleSlots: [slot('Проверочное занятие', 3, '10:00', '11:00', 1)],
  });

  if (response.status !== 201 && response.status !== 200) {
    throw new Error(`публикация клуба «${name}»: ${response.status} ${response.text}`);
  }

  return response.body?.data;
}

/** Публикация карточки тренера от лица вошедшего тренера. */
export async function publishTrainer(page, run = '') {
  const response = await api(page, 'POST', '/api/trainers', {
    firstName: 'Павел',
    lastName: `Тренеров ${run}`.trim(),
    city: 'Самара',
    address: 'ул. Проверочная, 2',
    bio: 'Карточка тренера заведена браузерным прогоном чек-листа фазы 34 для проверки разделения прав тренера и представителя услуг.',
    experience: '5',
    sportIds: [1],
    specialtyIds: [1],
    workFormatIds: [1],
    phone: '+7 (900) 000-00-03',
    vk: '',
    telegram: '',
    facebook: '',
    offeringName: 'Персональная тренировка',
    offeringDescription: 'Занятие один на один',
    offeringFormat: 'Индивидуально',
    offeringPrice: '1500',
    offeringDuration: '60',
    offeringLocation: 'Зал 1',
    clubId: null,
    coordinates: COORDS,
    cityCoordinates: COORDS,
    scheduleSlots: [slot('Персональная тренировка', 4, '12:00', '13:00', 1)],
  });

  if (response.status !== 201 && response.status !== 200) {
    throw new Error(`публикация тренера: ${response.status} ${response.text}`);
  }

  return response.body?.data;
}

/** Найти будущий слот по владельцу: расписание отдаёт бэкенд, отбор — его же. */
export async function findSlot(page, predicate) {
  const response = await api(page, 'GET', '/api/schedule?ownerType=all');
  const rows = response.body?.data ?? [];

  return rows.find(predicate) ?? null;
}

export { slot };
