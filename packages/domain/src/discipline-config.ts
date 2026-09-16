// Конфиг дисциплинарных параметров платформы: окна авто-переходов машины
// состояний записи и окна отмены по политике.
// Единственный источник «магических чисел» для FSM и правила «отмена вовремя
// или поздно» (`computeCancelReason` в `booking-fsm.ts`). Все параметры —
// константы компиляции; изменение значений требует пересборки.
//
// ⚠️ Фаза 38, шаг 38.26: пороги бейджа надёжности (`minCompletedForBadge`,
// `warningThreshold`, `dangerThreshold`) сняты вместе с самим механизмом —
// решение заказчика 15.09.2026. Окна FSM остались: они и есть «дисциплина».

export const DISCIPLINE_CONFIG = {
  pending: {
    // За сколько часов до начала слота pending-запись автоматически переходит
    // в cancelled_by_provider через runLazyBookingTransitions (actor='system').
    // Защищает атлета от "провайдер не ответил, а слот уже начался".
    autoCancelHoursBeforeStart: 1,
  },

  checkIn: {
    // Окно check-in после конца слота в часах. После истечения booking автоматически
    // уходит в unmarked через runLazyBookingTransitions (actor='system').
    // unmarked — финальное состояние, не считается ни как проведение, ни как no_show.
    windowHoursAfterEnd: 48,
  },

  lateCancel: {
    // Часы до начала слота, в течение которых отмена атлетом считается on_time
    // (без влияния на рейтинг). За границей окна — cancelReason='late'.
    // no_refund = 0: любая отмена = late.
    // free_anytime = Infinity: любая отмена on_time.
    freeUntil: {
      free_anytime: Number.POSITIVE_INFINITY,
      free_until_24h: 24,
      free_until_2h: 2,
      no_refund: 0,
    },
  },
} as const;

// Публичный тип конфига — для параметризации FSM-утилит. Использование
// DisciplineConfig вместо хардкода значений делает функции тестируемыми под
// произвольные окна (в тестах можно подменить конкретные значения).
export type DisciplineConfig = typeof DISCIPLINE_CONFIG;
