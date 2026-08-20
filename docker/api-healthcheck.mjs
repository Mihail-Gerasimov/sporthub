// Проверка живости бэкенда для контейнера.
//
// Отдельный файл, а не строка в описании сервиса: строка с вложенными кавычками
// читается хуже, чем сам запрос, и ломается при первой правке.
const port = process.env.API_PORT ?? '3001';

try {
  const response = await fetch(`http://127.0.0.1:${port}/api/health`);

  process.exit(response.ok ? 0 : 1);
} catch {
  process.exit(1);
}
