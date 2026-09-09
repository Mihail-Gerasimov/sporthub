import path from 'node:path';

import type { NextConfig } from 'next';

// Корень монорепозитория — на два уровня выше apps/web.
const monorepoRoot = path.join(__dirname, '..', '..');

/**
 * Адрес бэкенда. Фронт и бэк — два процесса; в разработке второй слушает 3001.
 * Значение задаётся переменной окружения, чтобы в бою указать реальный адрес,
 * не трогая код.
 */
const apiOrigin = process.env.SPORT_HUB_API_ORIGIN ?? 'http://localhost:3001';

/**
 * Заголовки безопасности (фаза 34, шаг 34.52).
 *
 * До этой фазы не отдавался ни один: страницу можно было вложить в чужой фрейм
 * и собирать нажатия, браузер угадывал тип содержимого сам, а адрес страницы
 * с идентификаторами уезжал на чужие сайты в `Referer`.
 *
 * ⚠️ Правила источников (CSP) намеренно перечисляют то, чем проект реально
 * пользуется, и ничего сверх: карты и подсказки Яндекса, шрифты Google, картинки
 * откуда угодно (аватары и обложки — внешние ссылки). Список надо править
 * вместе с подключением любой новой внешней службы, иначе она молча не заработает
 * в бою и заработает в разработке.
 */
/**
 * Узлы, с которых грузятся карты. Объявлены ОДНИМ списком и отсюда же
 * подставляются в правила источников: адресов у карты четыре, они разные,
 * и держать их россыпью по строке правил — значит однажды забыть один.
 *
 * ⚠️ `bundle` — не адрес API, а отдельный узел раздачи. Загрузчик третьей версии
 * тянет с него свой пакет и стили уже ПОСЛЕ того, как сам загружен с `api`.
 * Пока его тут не было, карта на главной не появлялась вовсе: браузер отбивал
 * пакет по правилам источников, а в консоли об этом знал только он.
 */
export const MAP_HOSTS = {
  /** Точка входа API карт. */
  api: 'https://api-maps.yandex.ru',
  /** Узел раздачи: пакет загрузчика и его стили. */
  bundle: 'https://yastatic.net',
  /** Плитки карты. */
  tiles: 'https://*.maps.yandex.net',
  /** Поиск координат по адресу. */
  geocode: 'https://geocode-maps.yandex.ru',
} as const;

const SECURITY_HEADERS = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // `unsafe-inline` и `unsafe-eval` нужны самому Next для гидратации и картам
      // Яндекса. Убираются вместе с переходом на одноразовые метки скриптов.
      `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${MAP_HOSTS.api} ${MAP_HOSTS.bundle} ${MAP_HOSTS.tiles}`,
      `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com ${MAP_HOSTS.bundle}`,
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https:",
      `connect-src 'self' ${MAP_HOSTS.api} ${MAP_HOSTS.bundle} ${MAP_HOSTS.tiles} ${MAP_HOSTS.geocode}`,
      // Ни один сторонний сайт не вправе показать нашу страницу внутри себя.
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; '),
  },
  // Дублирует `frame-ancestors` для браузеров постарше.
  { key: 'X-Frame-Options', value: 'DENY' },
  // Браузер не угадывает тип содержимого: загруженный файл не станет скриптом.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Наружу уходит только источник, без пути: адрес страницы с номерами записей
  // не должен попадать в чужие журналы.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Возможности, которыми проект не пользуется, выключены до первого запроса.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), payment=(), usb=()' },
  // Год строгого HTTPS. Домен уже под сертификатом Let's Encrypt.
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
];

const nextConfig: NextConfig = {
  // Next 16 сам ищет корень, поднимаясь по дереву в поисках lockfile. В монорепо
  // с несколькими package.json это определение нестабильно, поэтому фиксируем явно.
  // outputFileTracingRoot — для трассировки файлов, turbopack.root — для резолва
  // модулей: разные механизмы, но корень у них один и тот же.
  outputFileTracingRoot: monorepoRoot,
  turbopack: {
    root: monorepoRoot,
  },
  /**
   * Все обращения к `/api/*` уходят на бэкенд как есть. Благодаря этому
   * клиентский код не изменился ни в одном из полусотни мест вызова: адреса
   * остались прежними, поменялся лишь процесс, который на них отвечает.
   */
  /** Заголовки безопасности — на каждую страницу и каждый ответ прокси. */
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
