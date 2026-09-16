-- Фаза 38, шаг 38.80: цвет вида спорта на карте.
--
-- Карта главной красит каплю маркера и точку легенды цветом вида (`sports[].color`);
-- до этого шага поля не было ни в схеме, ни в API — в проде все капли серые,
-- легенда — N одинаковых точек.
--
-- ⚠️ Миграция АДДИТИВНАЯ: одна колонка, NULL по умолчанию — виды, заведённые
-- до неё, живут без цвета, старый клиент разницы не видит.
--
-- ⚠️ Разметка видов сида — здесь же, одним UPDATE по естественному ключу `slug`
-- и ТОЛЬКО там, где колонка пуста: сид на боевой базе не запускается
-- (docker/PRODUCTION.md, §5.3), и без разметки в миграции капли на боевой карте
-- остались бы серыми. Палитра та же, что в `packages/fixtures` (`fixtureSports`):
-- совпадение сверяет apps/api/src/test/sports-color-migration.test.ts, исполняя
-- этот же файл, — разойтись двум копиям молча негде.
--
-- ⚠️ CHECK на формат: `#rrggbb` строчными или пусто. Карта получает строку как есть,
-- и «red» дал бы серую каплю молча. Выражение — то же, что в scripts/db-constraints.mjs;
-- совпадение сверяет apps/api/src/test/schema.test.ts. Регулярное выражение —
-- диалект PostgreSQL, как и остальные проверки того файла.

ALTER TABLE "sports" ADD COLUMN "color" VARCHAR(7);

ALTER TABLE "sports"
  ADD CONSTRAINT "sports_color_hex" CHECK (color IS NULL OR color ~ '^#[0-9a-f]{6}$');

-- Шесть цветов — легенда карты макета (prosport, `catColors`); бокс, пилатес и борьба —
-- из его же палитры секторов. Чужой цвет (колонка уже заполнена) не переписывается.
UPDATE "sports" AS s
   SET "color" = palette.color
  FROM (VALUES
         ('yoga',         '#8b5cf6'),
         ('boxing',       '#f59e0b'),
         ('swimming',     '#3b82f6'),
         ('crossfit',     '#ef4444'),
         ('dance',        '#ec4899'),
         ('gym',          '#6b7280'),
         ('martial-arts', '#f97316'),
         ('pilates',      '#10b981'),
         ('borbahetkay',  '#6366f1')
       ) AS palette(slug, color)
 WHERE s."slug" = palette.slug
   AND s."color" IS NULL;
