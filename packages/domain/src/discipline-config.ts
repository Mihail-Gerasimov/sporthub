// Конфиг дисциплинарных параметров платформы: пороги рейтингов надёжности,
// окна авто-переходов FSM booking'а, условия карантина атлета, окна отмены по policy.
// Единственный источник "магических чисел" для FSM, reliability-утилит и guard'ов.
// Все параметры — константы компиляции; изменение значений требует пересборки.
// Используется в Step 24.3 (FSM transitionBooking/runLazyBookingTransitions),
// Step 24.12 (reliability.ts), Step 24.14 (карантин-guard, late-cancel warning).

export const DISCIPLINE_CONFIG = {
  // Минимум завершённых booking'ов у пользователя для публичного отображения бейджа
  // надёжности. Ниже этого порога на публичных поверхностях — компактная плашка
  // "Новый пользователь" без числового рейтинга. Grace-периода для карантина нет —
  // карантин срабатывает и у новичков (осознанное решение Phase 24).
  minCompletedForBadge: 5,

  reliability: {
    // Порог жёлтого бейджа "warning": completionRate < 0.90
    warningThreshold: 0.9,
    // Порог красного бейджа "danger": completionRate < 0.75
    dangerThreshold: 0.75,
  },

  quarantine: {
    // Количество no_show подряд (без разрыва через completed) для срабатывания карантина
    consecutiveNoShowTrigger: 3,
    // Окно учёта no_show в днях — считаем только booking'и за последние N дней
    windowDays: 30,
    // Длительность карантина в днях с момента последнего no_show
    durationDays: 7,
  },

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

// Публичный тип конфига — для параметризации функций reliability.ts и FSM-утилит.
// Использование DisciplineConfig вместо хардкода значений делает функции тестируемыми
// под произвольные пороги (в тестах можно подменить конкретные значения).
export type DisciplineConfig = typeof DISCIPLINE_CONFIG;
