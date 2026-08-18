// Описание процессов для pm2.
//
// Процессов два и они разной природы: фронт отдаёт страницы, бэкенд — данные.
// Наружу через nginx смотрит только фронт; бэкенд слушает петлевой адрес,
// поэтому обратиться к нему можно лишь изнутри машины.
//
// Ключи карт заданы в `apps/api/.env`: прокси адресов живёт на бэкенде.

module.exports = {
  apps: [
    {
      name: 'sporthub-api',
      cwd: './apps/api',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        API_PORT: 3001,
      },
      // Перезапуск при утечке: 2 ГБ на машине делятся между двумя процессами.
      max_memory_restart: '600M',
      time: true,
    },
    {
      name: 'sporthub-web',
      cwd: './apps/web',
      script: 'node_modules/next/dist/bin/next',
      args: 'start --port 3000',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        // Адрес бэкенда: и для проксирования, и для отрисовки страниц.
        SPORT_HUB_API_ORIGIN: 'http://127.0.0.1:3001',
      },
      max_memory_restart: '900M',
      time: true,
    },
  ],
};
