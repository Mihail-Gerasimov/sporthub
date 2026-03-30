// Тесты валидации publish-форм (Step 13.5 / Step 14.6)
import { describe, expect, it } from 'vitest';

import { validateClubForm, validateTrainerForm } from '@/components/profile/publish-validation';

// --- Хелпер: минимально валидное состояние формы клуба ---

function validClubForm() {
  return {
    name: 'FitZone Studio',
    city: 'Москва',
    address: 'ул. Спортивная, 10',
    description:
      'Современный клуб с большим залом, групповыми программами и стабильным расписанием для новичков и продвинутых.',
    phone: '+7 999 123-45-67',
    email: 'info@club.ru',
    priceFrom: '500',
    disciplines: ['Йога'],
    tags: [],
    amenities: [],
    scheduleSlots: [
      {
        title: 'Утренняя йога',
        date: '2026-04-01',
        startTime: '08:00',
        endTime: '09:00',
        price: '900',
        capacity: '12',
        location: 'Зал №1',
        discipline: 'Йога',
      },
    ],
  };
}

// --- Хелпер: минимально валидное состояние формы тренера ---

function validTrainerForm() {
  return {
    firstName: 'Александр',
    lastName: 'Иванов',
    city: 'Москва',
    address: 'ул. Спортивная, 10',
    bio: 'Опытный тренер по боксу с большим стажем, который работает с новичками и готовит спортсменов к турнирам.',
    experience: '5',
    sport: 'Бокс',
    specializations: ['Персональные тренировки'],
    workFormat: 'В клубе',
    offeringName: 'Персональная тренировка',
    offeringDescription: 'Индивидуальное занятие по технике, защите и работе на лапах.',
    offeringFormat: 'Индивидуальная',
    offeringPrice: '2000',
    offeringDuration: '60',
    offeringLocation: 'Зал №3',
    clubId: null,
    scheduleSlots: [
      {
        title: 'Утренняя тренировка',
        date: '2026-04-01',
        startTime: '09:00',
        endTime: '10:00',
        price: '2000',
        capacity: '1',
        location: 'Зал №3',
        discipline: 'Бокс',
      },
    ],
  };
}

describe('validateClubForm', () => {
  it('возвращает пустой объект для валидной формы', () => {
    const errors = validateClubForm(validClubForm());
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('требует название клуба', () => {
    const errors = validateClubForm({ ...validClubForm(), name: '' });
    expect(errors.name).toBeDefined();
  });

  it('требует город', () => {
    const errors = validateClubForm({ ...validClubForm(), city: '' });
    expect(errors.city).toBeDefined();
  });

  it('требует адрес', () => {
    const errors = validateClubForm({ ...validClubForm(), address: '' });
    expect(errors.address).toBeDefined();
  });

  it('требует описание', () => {
    const errors = validateClubForm({ ...validClubForm(), description: '' });
    expect(errors.description).toBeDefined();
  });

  it('требует описание длиной минимум 50 символов', () => {
    const errors = validateClubForm({
      ...validClubForm(),
      description: 'Слишком короткое описание',
    });
    expect(errors.description).toBeDefined();
  });

  it('требует телефон', () => {
    const errors = validateClubForm({ ...validClubForm(), phone: '' });
    expect(errors.phone).toBeDefined();
  });

  it('проверяет формат email', () => {
    const errors = validateClubForm({ ...validClubForm(), email: 'не-email' });
    expect(errors.email).toBeDefined();
  });

  it('принимает пустой email (необязательное поле для клуба)', () => {
    const errors = validateClubForm({ ...validClubForm(), email: '' });
    expect(errors.email).toBeUndefined();
  });

  it('требует цену от (положительное число)', () => {
    const errorsEmpty = validateClubForm({ ...validClubForm(), priceFrom: '' });
    expect(errorsEmpty.priceFrom).toBeDefined();

    const errorsNeg = validateClubForm({ ...validClubForm(), priceFrom: '-100' });
    expect(errorsNeg.priceFrom).toBeDefined();
  });

  it('требует минимум 1 направление', () => {
    const errors = validateClubForm({ ...validClubForm(), disciplines: [] });
    expect(errors.disciplines).toBeDefined();
  });

  it('не валидирует tags и amenities как обязательные поля', () => {
    const errors = validateClubForm({
      ...validClubForm(),
      tags: [],
      amenities: [],
    });
    expect(errors.tags).toBeUndefined();
    expect(errors.amenities).toBeUndefined();
  });

  it('требует заполненное стартовое расписание', () => {
    const errors = validateClubForm({
      ...validClubForm(),
      scheduleSlots: [{ ...validClubForm().scheduleSlots[0], title: '' }],
    });
    expect(errors.scheduleSlots).toBeDefined();
  });
});

describe('validateTrainerForm', () => {
  it('возвращает пустой объект для валидной формы', () => {
    const errors = validateTrainerForm(validTrainerForm());
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('требует имя', () => {
    const errors = validateTrainerForm({ ...validTrainerForm(), firstName: '' });
    expect(errors.firstName).toBeDefined();
  });

  it('требует фамилию', () => {
    const errors = validateTrainerForm({ ...validTrainerForm(), lastName: '' });
    expect(errors.lastName).toBeDefined();
  });

  it('требует город и адрес', () => {
    const errors = validateTrainerForm({
      ...validTrainerForm(),
      city: '',
      address: '',
    });
    expect(errors.city).toBeDefined();
    expect(errors.address).toBeDefined();
  });

  it('требует описание (bio)', () => {
    const errors = validateTrainerForm({ ...validTrainerForm(), bio: '' });
    expect(errors.bio).toBeDefined();
  });

  it('требует bio длиной минимум 50 символов', () => {
    const errors = validateTrainerForm({ ...validTrainerForm(), bio: 'Короткое описание' });
    expect(errors.bio).toBeDefined();
  });

  it('требует опыт (положительное число)', () => {
    const errorsEmpty = validateTrainerForm({ ...validTrainerForm(), experience: '' });
    expect(errorsEmpty.experience).toBeDefined();

    const errorsNeg = validateTrainerForm({ ...validTrainerForm(), experience: '-1' });
    expect(errorsNeg.experience).toBeDefined();
  });

  it('требует основной вид спорта', () => {
    const errors = validateTrainerForm({ ...validTrainerForm(), sport: '' });
    expect(errors.sport).toBeDefined();
  });

  it('требует минимум 1 специализацию', () => {
    const errors = validateTrainerForm({ ...validTrainerForm(), specializations: [] });
    expect(errors.specializations).toBeDefined();
  });

  it('требует формат работы', () => {
    const errors = validateTrainerForm({ ...validTrainerForm(), workFormat: '' });
    expect(errors.workFormat).toBeDefined();
  });

  it('требует описание, формат, цену и длительность услуги', () => {
    const errors = validateTrainerForm({
      ...validTrainerForm(),
      offeringDescription: '',
      offeringFormat: '',
      offeringPrice: '',
      offeringDuration: '',
    });
    expect(errors.offeringDescription).toBeDefined();
    expect(errors.offeringFormat).toBeDefined();
    expect(errors.offeringPrice).toBeDefined();
    expect(errors.offeringDuration).toBeDefined();
  });

  it('требует адрес проведения тренировки и заполненное расписание', () => {
    const errors = validateTrainerForm({
      ...validTrainerForm(),
      offeringLocation: '',
      scheduleSlots: [{ ...validTrainerForm().scheduleSlots[0], startTime: '' }],
    });
    expect(errors.offeringLocation).toBeDefined();
    expect(errors.scheduleSlots).toBeDefined();
  });

  it('не требует clubId (опциональная привязка)', () => {
    const errors = validateTrainerForm({ ...validTrainerForm(), clubId: null });
    expect(errors.clubId).toBeUndefined();
  });
});
