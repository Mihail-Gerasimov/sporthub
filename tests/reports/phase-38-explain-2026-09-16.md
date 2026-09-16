<!-- Отчёт EXPLAIN всех новых запросов фазы 38 — шаг 38.99, часть 1. -->

# EXPLAIN запросов фазы 38 — 16.09.2026

**Что снято.** `EXPLAIN (ANALYZE, BUFFERS)` по всем запросам, которые фаза 38 завела или
изменила: витрина (`sort=rating&limit=6/4`, предикат `status = 'published'`),
`GET /api/stats/overview` (четыре `count`), `GET /api/sports?popular=5`,
`GET /api/publications?verified=false|true` (раздел модерации, 38.47) и `count(filter)`
каталога (38.28; читает счёт «N в выдаче», 38.82). Каждый — индекс или названная причина
его отсутствия. Продолжает `phase-38-explain-showcase-2026-09-15.md` (38.32, 38.68).

**Два стенда — и почему.** Живая база `sporthub` (порт 5434) после уборки прогонов:
3 клуба, 3 тренера, 9 людей, 5 отзывов, 9 видов. На трёх строках планировщик ВСЕГДА
берёт полный перебор — план на живой базе ничего не говорит об индексах, и снимать его
одного значило бы отчитаться «индексов не видно» о базе, где их не бывает видно. Поэтому
планы сняты дважды: на живой базе (как есть, 0,005–0,12 мс на запрос) и на схеме
`explain_phase38` в `sporthub_test` (миграции штатные, `VACUUM ANALYZE`): по 5000 клубов,
тренеров и людей, 5000 отзывов, 30 видов, 9000 строк `club_sports`, 5000 `trainer_sports`;
каждая десятая публикация скрыта, каждая третья подтверждена, каждый сотый человек —
администратор, каждая четвёртая публикация в Тольятти. Схема удалена после снятия.
Стенд и контейнеры приложения не трогались — только чтение.

**Запросы** — эквиваленты того, что уходит из `PrismaClubsRepository.findAll` / `count`,
`PrismaTrainersRepository`, `PrismaSportsRepository.findPopular` (SQL дословно) и
`UsersRepository.countByAccountKind`: те же предикаты, порядок и срез; список колонок
на план не влияет.

## Сводка: индекс или названная причина

| №   | Запрос                                                      | План на 5000 строк                                                                                            | Время    | Индекс / причина                                                                                                                                                                                                                                                                                                                                                   |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | клубы `sort=rating&limit=6`, `status = 'published'`         | Index Scan `clubs_status_rating_review_count_idx` → Incremental Sort (по `id`) → Limit, **7 строк прочитано** | 0,084 мс | **индекс** `(status, rating DESC, review_count DESC)`; `id` — вторичный ключ поверх, ради стабильной верхушки                                                                                                                                                                                                                                                      |
| 2   | тренеры `sort=rating&limit=4`                               | Index Scan `trainers_status_rating_review_count_idx`, 5 строк                                                 | 0,056 мс | **индекс**, зеркально                                                                                                                                                                                                                                                                                                                                              |
| 3a  | `/stats/overview`: `count(*)` клубов `status = 'published'` | Seq Scan, 4500 из 5000                                                                                        | 1,108 мс | индекс `clubs_status_created_at_idx` ЕСТЬ; планировщик берёт перебор, потому что подходят 90 % строк — индекс отбросил бы одну десятую, а стоил бы обход дерева. В 38.32 на тех же данных брал Index Only Scan (0,30 мс): оба плана — доли миллисекунды, выбор за избирательностью, не за нами                                                                     |
| 3b  | `count(*)` тренеров                                         | Seq Scan                                                                                                      | 0,905 мс | то же                                                                                                                                                                                                                                                                                                                                                              |
| 3c  | `count(*)` людей `account_kind = 'person'`                  | Seq Scan, 4950 из 5000                                                                                        | 0,727 мс | индекса **нет намеренно** (38.30): значений два, почти все строки — `person`; индекс не отбросил бы ничего и удорожил бы вставку                                                                                                                                                                                                                                   |
| 3d  | `count(*)` отзывов                                          | Seq Scan                                                                                                      | 0,441 мс | предиката нет — считать нечем, кроме обхода; порог кэширования маршрута назван в `stats.controller.ts` (свыше ~50 запросов/с — кэш 60 с)                                                                                                                                                                                                                           |
| 4   | `/sports?popular=5` (`findPopular` дословно)                | Hash Join `club_sports` × `clubs` → HashAggregate по виду (и то же по тренерам) → top-N heapsort → Limit      | 4,756 мс | индекса **нет намеренно** (38.68): популярность считается по ВСЕМ опубликованным публикациям, обход связующих таблиц целиком неизбежен по смыслу; `status = 'published'` оставляет 90 %. Линейно ≈0,5 мс на тысячу публикаций; порог назван в контроллере — при десятках тысяч кэш у маршрута, не индекс                                                           |
| 5a  | `/publications?verified=false`: клубы `verified_at IS NULL` | Index Scan `clubs_pkey` (порядок `ORDER BY id`) с фильтром, 3334 из 5000 строк, отброшено 1666                | 0,690 мс | индекса по `verified_at` **нет намеренно** (38.40): избирательность низкая — непроверенных две трети (на живой базе — все), индекс отбросил бы треть ценой обхода дерева. Список читается целиком по замыслу контроллера: слияние клубов и тренеров, порядок и срез — в памяти, причина названа в `moderation.controller.ts` (две таблицы с независимыми номерами) |
| 5b  | то же + `status = 'published'`                              | Index Scan `clubs_pkey` с фильтром, 3000 строк                                                                | 0,696 мс | то же                                                                                                                                                                                                                                                                                                                                                              |
| 5c  | `/publications?verified=true`                               | Index Scan `clubs_pkey` с фильтром, 1666 строк                                                                | 0,589 мс | то же: треть строк                                                                                                                                                                                                                                                                                                                                                 |
| 5d  | `verified=false`: тренеры                                   | Index Scan `trainers_pkey` с фильтром, 3334 строк                                                             | 0,673 мс | то же                                                                                                                                                                                                                                                                                                                                                              |
| 6a  | `count(filter)` каталога: опубликованные                    | Seq Scan                                                                                                      | 0,672 мс | как 3a — тот же `buildPublicationWhere`, тот же индекс, тот же выбор планировщика                                                                                                                                                                                                                                                                                  |
| 6b  | опубликованные + город                                      | Bitmap Index Scan `clubs_city_status_idx` → Bitmap Heap → Aggregate, 1000 строк                               | 0,146 мс | **индекс** `(city, status)` — существовал под пару «город и состояние»                                                                                                                                                                                                                                                                                             |
| 6c  | опубликованные + вид спорта (`some` → `IN` по связующей)    | Bitmap Index Scan `club_sports_sport_id_idx` (334 связи) → Hash Semi Join с Seq Scan `clubs` (4500)           | 0,816 мс | **индекс** по связующей `club_sports(sport_id)` берётся; сторона клубов — перебор, потому что `status` оставляет 90 %. При редком виде спорта планировщик развернёт соединение (связи → `clubs_pkey`) сам — обе стороны индексированы                                                                                                                              |
| 6d  | тренеры, опубликованные + вид спорта                        | Bitmap Index Scan `trainer_sports_sport_id_idx` (167) → Hash Semi Join с Seq Scan `trainers`                  | 0,684 мс | то же                                                                                                                                                                                                                                                                                                                                                              |

**Итог.** Новых индексов фаза не требует. Две группы без индекса названы с причиной:
счётчики по неизбирательным колонкам (3c, 3d, 4) — обход таблицы по смыслу запроса,
защита — порог кэширования у маршрута; отбор `verified_at` (5a–5d) — читается целиком по
замыслу контроллера модерации, и порог назван там же: когда каталог перевалит за десятки
тысяч публикаций, честная постраничность в запросе (`UNION ALL` двух выборок + частичный
индекс `WHERE verified_at IS NULL` по `created_at`) — а не индекс по одной колонке.
Самый дорогой запрос фазы — `?popular` (4,8 мс на 10 000 публикаций); он уходит один раз
на открытие выпадашки, не на каждую загрузку главной.

**Что подтвердил 38.32 и что изменилось с тех пор.** Витрина (1, 2) по-прежнему идёт
индексом и читает 5–7 строк вместо 4500 — предикат `status = 'published'` держится
(сторож `entities.repository.test.ts`). Счёт `count(*)` по `status` планировщик сегодня
считает перебором там, где в 38.32 брал Index Only Scan: разница 0,3 против 0,7–1,1 мс
на 5000 строк — это статистика после `VACUUM`, не регресс запроса; индекс на месте,
и при большей избирательности (много скрытых) он вернётся в план сам.

## Планы целиком

<details>
<summary>стенд 5000 строк — схема explain_phase38 на sporthub_test</summary>

```
--- 1. витрина: шесть лучших клубов (sort=rating&limit=6, status = published)
                                                                          QUERY PLAN
--------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=1.61..2.58 rows=6 width=16) (actual time=0.068..0.069 rows=6 loops=1)
   Buffers: shared hit=21
   ->  Incremental Sort  (cost=1.61..728.38 rows=4500 width=16) (actual time=0.068..0.068 rows=6 loops=1)
         Sort Key: rating DESC, review_count DESC, id
         Presorted Key: rating, review_count
         Full-sort Groups: 1  Sort Method: quicksort  Average Memory: 25kB  Peak Memory: 25kB
         Buffers: shared hit=21
         ->  Index Scan using clubs_status_rating_review_count_idx on clubs  (cost=0.28..590.81 rows=4500 width=16) (actual time=0.019..0.048 rows=7 loops=1)
               Index Cond: ((status)::text = 'published'::text)
               Buffers: shared hit=9
 Planning:
   Buffers: shared hit=298
 Planning Time: 0.369 ms
 Execution Time: 0.084 ms
--- 2. витрина: четыре лучших тренера (sort=rating&limit=4)
                                                                             QUERY PLAN
--------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=1.43..2.00 rows=4 width=16) (actual time=0.052..0.052 rows=4 loops=1)
   Buffers: shared hit=7
   ->  Incremental Sort  (cost=1.43..640.82 rows=4500 width=16) (actual time=0.051..0.052 rows=4 loops=1)
         Sort Key: rating DESC, review_count DESC, id
         Presorted Key: rating, review_count
         Full-sort Groups: 1  Sort Method: quicksort  Average Memory: 25kB  Peak Memory: 25kB
         Buffers: shared hit=7
         ->  Index Scan using trainers_status_rating_review_count_idx on trainers  (cost=0.28..507.07 rows=4500 width=16) (actual time=0.023..0.049 rows=5 loops=1)
               Index Cond: ((status)::text = 'published'::text)
               Buffers: shared hit=7
 Planning:
   Buffers: shared hit=193
 Planning Time: 0.147 ms
 Execution Time: 0.056 ms
--- 3a. /stats/overview: count клубов
                                                 QUERY PLAN
-------------------------------------------------------------------------------------------------------------
 Aggregate  (cost=204.75..204.76 rows=1 width=8) (actual time=1.100..1.100 rows=1 loops=1)
   Buffers: shared hit=131
   ->  Seq Scan on clubs  (cost=0.00..193.50 rows=4500 width=0) (actual time=0.003..0.973 rows=4500 loops=1)
         Filter: ((status)::text = 'published'::text)
         Rows Removed by Filter: 500
         Buffers: shared hit=131
 Planning:
   Buffers: shared hit=4
 Planning Time: 0.029 ms
 Execution Time: 1.108 ms
--- 3b. /stats/overview: count тренеров
                                                   QUERY PLAN
----------------------------------------------------------------------------------------------------------------
 Aggregate  (cost=173.75..173.76 rows=1 width=8) (actual time=0.902..0.902 rows=1 loops=1)
   Buffers: shared hit=100
   ->  Seq Scan on trainers  (cost=0.00..162.50 rows=4500 width=0) (actual time=0.005..0.776 rows=4500 loops=1)
         Filter: ((status)::text = 'published'::text)
         Rows Removed by Filter: 500
         Buffers: shared hit=100
 Planning:
   Buffers: shared hit=1
 Planning Time: 0.016 ms
 Execution Time: 0.905 ms
--- 3c. /stats/overview: count людей person
                                                 QUERY PLAN
-------------------------------------------------------------------------------------------------------------
 Aggregate  (cost=150.88..150.88 rows=1 width=8) (actual time=0.724..0.724 rows=1 loops=1)
   Buffers: shared hit=76
   ->  Seq Scan on users  (cost=0.00..138.50 rows=4950 width=0) (actual time=0.005..0.575 rows=4950 loops=1)
         Filter: ((account_kind)::text = 'person'::text)
         Rows Removed by Filter: 50
         Buffers: shared hit=76
 Planning:
   Buffers: shared hit=43
 Planning Time: 0.046 ms
 Execution Time: 0.727 ms
--- 3d. /stats/overview: count отзывов
                                                  QUERY PLAN
--------------------------------------------------------------------------------------------------------------
 Aggregate  (cost=99.50..99.51 rows=1 width=8) (actual time=0.438..0.439 rows=1 loops=1)
   Buffers: shared hit=37
   ->  Seq Scan on reviews  (cost=0.00..87.00 rows=5000 width=0) (actual time=0.006..0.304 rows=5000 loops=1)
         Buffers: shared hit=37
 Planning:
   Buffers: shared hit=143
 Planning Time: 0.110 ms
 Execution Time: 0.441 ms
--- 4. /sports?popular=5 (запрос findPopular дословно)
                                                                           QUERY PLAN
----------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=776.97..776.98 rows=5 width=78) (actual time=4.647..4.649 rows=5 loops=1)
   Buffers: shared hit=295
   ->  Sort  (cost=776.97..777.04 rows=30 width=78) (actual time=4.646..4.648 rows=5 loops=1)
         Sort Key: (((COALESCE(c.cnt, '0'::bigint) + COALESCE(t.cnt, '0'::bigint)))::integer) DESC, s.id
         Sort Method: top-N heapsort  Memory: 26kB
         Buffers: shared hit=295
         ->  Hash Left Join  (cost=775.63..776.47 rows=30 width=78) (actual time=4.625..4.637 rows=30 loops=1)
               Hash Cond: (s.id = t.sport_id)
               Buffers: shared hit=295
               ->  Merge Left Join  (cost=447.27..447.87 rows=30 width=82) (actual time=2.690..2.698 rows=30 loops=1)
                     Merge Cond: (s.id = c.sport_id)
                     Buffers: shared hit=172
                     ->  Sort  (cost=2.04..2.11 rows=30 width=74) (actual time=0.014..0.015 rows=30 loops=1)
                           Sort Key: s.id
                           Sort Method: quicksort  Memory: 28kB
                           Buffers: shared hit=1
                           ->  Seq Scan on sports s  (cost=0.00..1.30 rows=30 width=74) (actual time=0.008..0.009 rows=30 loops=1)
                                 Buffers: shared hit=1
                     ->  Sort  (cost=445.23..445.31 rows=30 width=12) (actual time=2.674..2.676 rows=27 loops=1)
                           Sort Key: c.sport_id
                           Sort Method: quicksort  Memory: 26kB
                           Buffers: shared hit=171
                           ->  Subquery Scan on c  (cost=443.90..444.50 rows=30 width=12) (actual time=2.666..2.670 rows=27 loops=1)
                                 Buffers: shared hit=171
                                 ->  HashAggregate  (cost=443.90..444.20 rows=30 width=12) (actual time=2.666..2.668 rows=27 loops=1)
                                       Group Key: cs.sport_id
                                       Batches: 1  Memory Usage: 24kB
                                       Buffers: shared hit=171
                                       ->  Hash Join  (cost=249.75..403.40 rows=8100 width=4) (actual time=0.885..2.126 rows=8500 loops=1)
                                             Hash Cond: (cs.club_id = cl.id)
                                             Buffers: shared hit=171
                                             ->  Seq Scan on club_sports cs  (cost=0.00..130.00 rows=9000 width=8) (actual time=0.002..0.468 rows=9000 loops=1)
                                                   Buffers: shared hit=40
                                             ->  Hash  (cost=193.50..193.50 rows=4500 width=4) (actual time=0.871..0.871 rows=4500 loops=1)
                                                   Buckets: 8192  Batches: 1  Memory Usage: 223kB
                                                   Buffers: shared hit=131
                                                   ->  Seq Scan on clubs cl  (cost=0.00..193.50 rows=4500 width=4) (actual time=0.002..0.632 rows=4500 loops=1)
                                                         Filter: ((status)::text = 'published'::text)
                                                         Rows Removed by Filter: 500
                                                         Buffers: shared hit=131
               ->  Hash  (cost=327.99..327.99 rows=30 width=12) (actual time=1.930..1.930 rows=27 loops=1)
                     Buckets: 1024  Batches: 1  Memory Usage: 10kB
                     Buffers: shared hit=123
                     ->  Subquery Scan on t  (cost=327.39..327.99 rows=30 width=12) (actual time=1.924..1.928 rows=27 loops=1)
                           Buffers: shared hit=123
                           ->  HashAggregate  (cost=327.39..327.69 rows=30 width=12) (actual time=1.924..1.926 rows=27 loops=1)
                                 Group Key: ts.sport_id
                                 Batches: 1  Memory Usage: 24kB
                                 Buffers: shared hit=123
                                 ->  Hash Join  (cost=218.75..304.89 rows=4500 width=4) (actual time=0.829..1.640 rows=4500 loops=1)
                                       Hash Cond: (ts.trainer_id = tr.id)
                                       Buffers: shared hit=123
                                       ->  Seq Scan on trainer_sports ts  (cost=0.00..73.00 rows=5000 width=8) (actual time=0.002..0.241 rows=5000 loops=1)
                                             Buffers: shared hit=23
                                       ->  Hash  (cost=162.50..162.50 rows=4500 width=4) (actual time=0.816..0.816 rows=4500 loops=1)
                                             Buckets: 8192  Batches: 1  Memory Usage: 223kB
                                             Buffers: shared hit=100
                                             ->  Seq Scan on trainers tr  (cost=0.00..162.50 rows=4500 width=4) (actual time=0.002..0.567 rows=4500 loops=1)
                                                   Filter: ((status)::text = 'published'::text)
                                                   Rows Removed by Filter: 500
                                                   Buffers: shared hit=100
 Planning:
   Buffers: shared hit=252
 Planning Time: 0.559 ms
 Execution Time: 4.756 ms
--- 5a. /publications?verified=false: клубы (findAll без сортировки — ORDER BY id)
                                                        QUERY PLAN
--------------------------------------------------------------------------------------------------------------------------
 Index Scan using clubs_pkey on clubs  (cost=0.28..273.28 rows=3334 width=4) (actual time=0.005..0.618 rows=3334 loops=1)
   Filter: (verified_at IS NULL)
   Rows Removed by Filter: 1666
   Buffers: shared hit=146
 Planning:
   Buffers: shared hit=4
 Planning Time: 0.035 ms
 Execution Time: 0.690 ms
--- 5b. /publications?verified=false&status=published: клубы
                                                        QUERY PLAN
--------------------------------------------------------------------------------------------------------------------------
 Index Scan using clubs_pkey on clubs  (cost=0.28..285.78 rows=3001 width=4) (actual time=0.005..0.632 rows=3000 loops=1)
   Filter: ((verified_at IS NULL) AND ((status)::text = 'published'::text))
   Rows Removed by Filter: 2000
   Buffers: shared hit=146
 Planning:
   Buffers: shared hit=1
 Planning Time: 0.029 ms
 Execution Time: 0.696 ms
--- 5c. /publications?verified=true: клубы
                                                        QUERY PLAN
--------------------------------------------------------------------------------------------------------------------------
 Index Scan using clubs_pkey on clubs  (cost=0.28..273.28 rows=1666 width=4) (actual time=0.004..0.553 rows=1666 loops=1)
   Filter: (verified_at IS NOT NULL)
   Rows Removed by Filter: 3334
   Buffers: shared hit=146
 Planning:
   Buffers: shared hit=1
 Planning Time: 0.018 ms
 Execution Time: 0.589 ms
--- 5d. /publications?verified=false: тренеры
                                                           QUERY PLAN
--------------------------------------------------------------------------------------------------------------------------------
 Index Scan using trainers_pkey on trainers  (cost=0.28..242.28 rows=3334 width=4) (actual time=0.004..0.600 rows=3334 loops=1)
   Filter: (verified_at IS NULL)
   Rows Removed by Filter: 1666
   Buffers: shared hit=115
 Planning:
   Buffers: shared hit=4
 Planning Time: 0.023 ms
 Execution Time: 0.673 ms
--- 6a. count(filter) каталога: опубликованные
                                                 QUERY PLAN
-------------------------------------------------------------------------------------------------------------
 Aggregate  (cost=204.75..204.76 rows=1 width=8) (actual time=0.668..0.668 rows=1 loops=1)
   Buffers: shared hit=131
   ->  Seq Scan on clubs  (cost=0.00..193.50 rows=4500 width=0) (actual time=0.002..0.543 rows=4500 loops=1)
         Filter: ((status)::text = 'published'::text)
         Rows Removed by Filter: 500
         Buffers: shared hit=131
 Planning:
   Buffers: shared hit=1
 Planning Time: 0.022 ms
 Execution Time: 0.672 ms
--- 6b. count(filter) каталога: опубликованные + город
                                                                QUERY PLAN
-------------------------------------------------------------------------------------------------------------------------------------------
 Aggregate  (cost=170.50..170.51 rows=1 width=8) (actual time=0.141..0.141 rows=1 loops=1)
   Buffers: shared hit=133
   ->  Bitmap Heap Scan on clubs  (cost=19.81..167.69 rows=1125 width=0) (actual time=0.034..0.116 rows=1000 loops=1)
         Recheck Cond: (((city)::text = 'Тольятти'::text) AND ((status)::text = 'published'::text))
         Heap Blocks: exact=131
         Buffers: shared hit=133
         ->  Bitmap Index Scan on clubs_city_status_idx  (cost=0.00..19.53 rows=1125 width=0) (actual time=0.025..0.025 rows=1000 loops=1)
               Index Cond: (((city)::text = 'Тольятти'::text) AND ((status)::text = 'published'::text))
               Buffers: shared hit=2
 Planning:
   Buffers: shared hit=1
 Planning Time: 0.022 ms
 Execution Time: 0.146 ms
--- 6c. count(filter) каталога: опубликованные + вид спорта (Prisma some → IN по связующей)
                                                                      QUERY PLAN
-------------------------------------------------------------------------------------------------------------------------------------------------------
 Aggregate  (cost=261.30..261.31 rows=1 width=8) (actual time=0.808..0.808 rows=1 loops=1)
   Buffers: shared hit=173
   ->  Hash Join  (cost=55.22..260.55 rows=301 width=0) (actual time=0.089..0.799 rows=334 loops=1)
         Hash Cond: (clubs.id = club_sports.club_id)
         Buffers: shared hit=173
         ->  Seq Scan on clubs  (cost=0.00..193.50 rows=4500 width=4) (actual time=0.001..0.535 rows=4500 loops=1)
               Filter: ((status)::text = 'published'::text)
               Rows Removed by Filter: 500
               Buffers: shared hit=131
         ->  Hash  (cost=51.05..51.05 rows=334 width=4) (actual time=0.084..0.084 rows=334 loops=1)
               Buckets: 1024  Batches: 1  Memory Usage: 20kB
               Buffers: shared hit=42
               ->  Bitmap Heap Scan on club_sports  (cost=6.87..51.05 rows=334 width=4) (actual time=0.014..0.066 rows=334 loops=1)
                     Recheck Cond: (sport_id = 7)
                     Heap Blocks: exact=40
                     Buffers: shared hit=42
                     ->  Bitmap Index Scan on club_sports_sport_id_idx  (cost=0.00..6.79 rows=334 width=0) (actual time=0.011..0.011 rows=334 loops=1)
                           Index Cond: (sport_id = 7)
                           Buffers: shared hit=2
 Planning:
   Buffers: shared hit=13
 Planning Time: 0.075 ms
 Execution Time: 0.816 ms
--- 6d. count(filter) каталога: тренеры, опубликованные + вид спорта
                                                                        QUERY PLAN
----------------------------------------------------------------------------------------------------------------------------------------------------------
 Aggregate  (cost=207.45..207.46 rows=1 width=8) (actual time=0.679..0.680 rows=1 loops=1)
   Buffers: shared hit=125
   ->  Hash Join  (cost=32.75..207.08 rows=150 width=0) (actual time=0.041..0.675 rows=167 loops=1)
         Hash Cond: (trainers.id = trainer_sports.trainer_id)
         Buffers: shared hit=125
         ->  Seq Scan on trainers  (cost=0.00..162.50 rows=4500 width=4) (actual time=0.001..0.481 rows=4500 loops=1)
               Filter: ((status)::text = 'published'::text)
               Rows Removed by Filter: 500
               Buffers: shared hit=100
         ->  Hash  (cost=30.66..30.66 rows=167 width=4) (actual time=0.037..0.038 rows=167 loops=1)
               Buckets: 1024  Batches: 1  Memory Usage: 14kB
               Buffers: shared hit=25
               ->  Bitmap Heap Scan on trainer_sports  (cost=5.58..30.66 rows=167 width=4) (actual time=0.007..0.030 rows=167 loops=1)
                     Recheck Cond: (sport_id = 7)
                     Heap Blocks: exact=23
                     Buffers: shared hit=25
                     ->  Bitmap Index Scan on trainer_sports_sport_id_idx  (cost=0.00..5.54 rows=167 width=0) (actual time=0.005..0.005 rows=167 loops=1)
                           Index Cond: (sport_id = 7)
                           Buffers: shared hit=2
 Planning:
   Buffers: shared hit=13
 Planning Time: 0.062 ms
 Execution Time: 0.684 ms
```

</details>

<details>
<summary>живая база sporthub — 3 клуба, 3 тренера (полный перебор везде — строк меньше страницы)</summary>

```
--- 1. витрина: шесть лучших клубов (sort=rating&limit=6, status = published)
                                                 QUERY PLAN
------------------------------------------------------------------------------------------------------------
 Limit  (cost=2.15..2.17 rows=6 width=16) (actual time=0.026..0.027 rows=3 loops=1)
   Buffers: shared hit=8
   ->  Sort  (cost=2.15..2.17 rows=6 width=16) (actual time=0.025..0.026 rows=3 loops=1)
         Sort Key: rating DESC, review_count DESC, id
         Sort Method: quicksort  Memory: 25kB
         Buffers: shared hit=8
         ->  Seq Scan on clubs  (cost=0.00..2.08 rows=6 width=16) (actual time=0.008..0.012 rows=3 loops=1)
               Filter: ((status)::text = 'published'::text)
               Buffers: shared hit=2
 Planning:
   Buffers: shared hit=236
 Planning Time: 0.410 ms
 Execution Time: 0.038 ms
--- 2. витрина: четыре лучших тренера (sort=rating&limit=4)
                                                  QUERY PLAN
---------------------------------------------------------------------------------------------------------------
 Limit  (cost=1.06..1.07 rows=3 width=16) (actual time=0.016..0.016 rows=3 loops=1)
   Buffers: shared hit=1
   ->  Sort  (cost=1.06..1.07 rows=3 width=16) (actual time=0.015..0.016 rows=3 loops=1)
         Sort Key: rating DESC, review_count DESC, id
         Sort Method: quicksort  Memory: 25kB
         Buffers: shared hit=1
         ->  Seq Scan on trainers  (cost=0.00..1.04 rows=3 width=16) (actual time=0.012..0.013 rows=3 loops=1)
               Filter: ((status)::text = 'published'::text)
               Buffers: shared hit=1
 Planning:
   Buffers: shared hit=143
 Planning Time: 0.201 ms
 Execution Time: 0.022 ms
--- 3a. /stats/overview: count клубов
                                             QUERY PLAN
-----------------------------------------------------------------------------------------------------
 Aggregate  (cost=2.09..2.10 rows=1 width=8) (actual time=0.005..0.005 rows=1 loops=1)
   Buffers: shared hit=2
   ->  Seq Scan on clubs  (cost=0.00..2.08 rows=6 width=0) (actual time=0.002..0.003 rows=3 loops=1)
         Filter: ((status)::text = 'published'::text)
         Buffers: shared hit=2
 Planning:
   Buffers: shared hit=3
 Planning Time: 0.035 ms
 Execution Time: 0.013 ms
--- 3b. /stats/overview: count тренеров
                                               QUERY PLAN
--------------------------------------------------------------------------------------------------------
 Aggregate  (cost=1.05..1.06 rows=1 width=8) (actual time=0.003..0.003 rows=1 loops=1)
   Buffers: shared hit=1
   ->  Seq Scan on trainers  (cost=0.00..1.04 rows=3 width=0) (actual time=0.002..0.002 rows=3 loops=1)
         Filter: ((status)::text = 'published'::text)
         Buffers: shared hit=1
 Planning:
   Buffers: shared hit=1
 Planning Time: 0.022 ms
 Execution Time: 0.007 ms
--- 3c. /stats/overview: count людей person
                                             QUERY PLAN
-----------------------------------------------------------------------------------------------------
 Aggregate  (cost=2.13..2.14 rows=1 width=8) (actual time=0.011..0.011 rows=1 loops=1)
   Buffers: shared hit=2
   ->  Seq Scan on users  (cost=0.00..2.11 rows=8 width=0) (actual time=0.005..0.010 rows=8 loops=1)
         Filter: ((account_kind)::text = 'person'::text)
         Rows Removed by Filter: 1
         Buffers: shared hit=2
 Planning:
   Buffers: shared hit=32
 Planning Time: 0.054 ms
 Execution Time: 0.015 ms
--- 3d. /stats/overview: count отзывов
                                              QUERY PLAN
-------------------------------------------------------------------------------------------------------
 Aggregate  (cost=1.06..1.07 rows=1 width=8) (actual time=0.009..0.009 rows=1 loops=1)
   Buffers: shared hit=1
   ->  Seq Scan on reviews  (cost=0.00..1.05 rows=5 width=0) (actual time=0.007..0.008 rows=5 loops=1)
         Buffers: shared hit=1
 Planning:
   Buffers: shared hit=100
 Planning Time: 0.119 ms
 Execution Time: 0.013 ms
--- 4. /sports?popular=5 (запрос findPopular дословно)
                                                                       QUERY PLAN
---------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=8.62..8.63 rows=5 width=1651) (actual time=0.068..0.070 rows=5 loops=1)
   Buffers: shared hit=7
   ->  Sort  (cost=8.62..8.66 rows=18 width=1651) (actual time=0.067..0.069 rows=5 loops=1)
         Sort Key: (((COALESCE(c.cnt, '0'::bigint) + COALESCE(t.cnt, '0'::bigint)))::integer) DESC, s.id
         Sort Method: quicksort  Memory: 27kB
         Buffers: shared hit=7
         ->  Hash Left Join  (cost=5.93..8.32 rows=18 width=1651) (actual time=0.052..0.061 rows=9 loops=1)
               Hash Cond: (s.id = t.sport_id)
               Buffers: shared hit=7
               ->  Hash Left Join  (cost=3.65..5.88 rows=18 width=1655) (actual time=0.033..0.040 rows=9 loops=1)
                     Hash Cond: (s.id = c.sport_id)
                     Buffers: shared hit=5
                     ->  Seq Scan on sports s  (cost=0.00..2.18 rows=18 width=1647) (actual time=0.005..0.008 rows=9 loops=1)
                           Buffers: shared hit=2
                     ->  Hash  (cost=3.56..3.56 rows=7 width=12) (actual time=0.022..0.023 rows=6 loops=1)
                           Buckets: 1024  Batches: 1  Memory Usage: 9kB
                           Buffers: shared hit=3
                           ->  Subquery Scan on c  (cost=3.42..3.56 rows=7 width=12) (actual time=0.020..0.022 rows=6 loops=1)
                                 Buffers: shared hit=3
                                 ->  HashAggregate  (cost=3.42..3.49 rows=7 width=12) (actual time=0.019..0.021 rows=6 loops=1)
                                       Group Key: cs.sport_id
                                       Batches: 1  Memory Usage: 24kB
                                       Buffers: shared hit=3
                                       ->  Hash Join  (cost=2.15..3.35 rows=14 width=4) (actual time=0.015..0.017 rows=8 loops=1)
                                             Hash Cond: (cs.club_id = cl.id)
                                             Buffers: shared hit=3
                                             ->  Seq Scan on club_sports cs  (cost=0.00..1.14 rows=14 width=8) (actual time=0.004..0.004 rows=8 loops=1)
                                                   Buffers: shared hit=1
                                             ->  Hash  (cost=2.08..2.08 rows=6 width=4) (actual time=0.006..0.006 rows=3 loops=1)
                                                   Buckets: 1024  Batches: 1  Memory Usage: 9kB
                                                   Buffers: shared hit=2
                                                   ->  Seq Scan on clubs cl  (cost=0.00..2.08 rows=6 width=4) (actual time=0.002..0.004 rows=3 loops=1)
                                                         Filter: ((status)::text = 'published'::text)
                                                         Buffers: shared hit=2
               ->  Hash  (cost=2.24..2.24 rows=4 width=12) (actual time=0.013..0.013 rows=4 loops=1)
                     Buckets: 1024  Batches: 1  Memory Usage: 9kB
                     Buffers: shared hit=2
                     ->  Subquery Scan on t  (cost=2.16..2.24 rows=4 width=12) (actual time=0.011..0.012 rows=4 loops=1)
                           Buffers: shared hit=2
                           ->  HashAggregate  (cost=2.16..2.20 rows=4 width=12) (actual time=0.011..0.011 rows=4 loops=1)
                                 Group Key: ts.sport_id
                                 Batches: 1  Memory Usage: 24kB
                                 Buffers: shared hit=2
                                 ->  Hash Join  (cost=1.08..2.14 rows=4 width=4) (actual time=0.009..0.010 rows=4 loops=1)
                                       Hash Cond: (ts.trainer_id = tr.id)
                                       Buffers: shared hit=2
                                       ->  Seq Scan on trainer_sports ts  (cost=0.00..1.04 rows=4 width=8) (actual time=0.002..0.002 rows=4 loops=1)
                                             Buffers: shared hit=1
                                       ->  Hash  (cost=1.04..1.04 rows=3 width=4) (actual time=0.003..0.003 rows=3 loops=1)
                                             Buckets: 1024  Batches: 1  Memory Usage: 9kB
                                             Buffers: shared hit=1
                                             ->  Seq Scan on trainers tr  (cost=0.00..1.04 rows=3 width=4) (actual time=0.001..0.002 rows=3 loops=1)
                                                   Filter: ((status)::text = 'published'::text)
                                                   Buffers: shared hit=1
 Planning:
   Buffers: shared hit=189
 Planning Time: 0.515 ms
 Execution Time: 0.121 ms
--- 5a. /publications?verified=false: клубы (findAll без сортировки — ORDER BY id)
                                             QUERY PLAN
-----------------------------------------------------------------------------------------------------
 Sort  (cost=2.14..2.15 rows=6 width=4) (actual time=0.006..0.006 rows=3 loops=1)
   Sort Key: id
   Sort Method: quicksort  Memory: 25kB
   Buffers: shared hit=2
   ->  Seq Scan on clubs  (cost=0.00..2.06 rows=6 width=4) (actual time=0.002..0.003 rows=3 loops=1)
         Filter: (verified_at IS NULL)
         Buffers: shared hit=2
 Planning:
   Buffers: shared hit=3
 Planning Time: 0.030 ms
 Execution Time: 0.009 ms
--- 5b. /publications?verified=false&status=published: клубы
                                             QUERY PLAN
-----------------------------------------------------------------------------------------------------
 Sort  (cost=2.15..2.17 rows=6 width=4) (actual time=0.005..0.005 rows=3 loops=1)
   Sort Key: id
   Sort Method: quicksort  Memory: 25kB
   Buffers: shared hit=2
   ->  Seq Scan on clubs  (cost=0.00..2.08 rows=6 width=4) (actual time=0.002..0.004 rows=3 loops=1)
         Filter: ((verified_at IS NULL) AND ((status)::text = 'published'::text))
         Buffers: shared hit=2
 Planning Time: 0.029 ms
 Execution Time: 0.008 ms
--- 5c. /publications?verified=true: клубы
                                             QUERY PLAN
-----------------------------------------------------------------------------------------------------
 Sort  (cost=2.07..2.07 rows=1 width=4) (actual time=0.003..0.003 rows=0 loops=1)
   Sort Key: id
   Sort Method: quicksort  Memory: 25kB
   Buffers: shared hit=2
   ->  Seq Scan on clubs  (cost=0.00..2.06 rows=1 width=4) (actual time=0.002..0.003 rows=0 loops=1)
         Filter: (verified_at IS NOT NULL)
         Rows Removed by Filter: 3
         Buffers: shared hit=2
 Planning Time: 0.014 ms
 Execution Time: 0.005 ms
--- 5d. /publications?verified=false: тренеры
                                               QUERY PLAN
--------------------------------------------------------------------------------------------------------
 Sort  (cost=1.05..1.06 rows=3 width=4) (actual time=0.004..0.004 rows=3 loops=1)
   Sort Key: id
   Sort Method: quicksort  Memory: 25kB
   Buffers: shared hit=1
   ->  Seq Scan on trainers  (cost=0.00..1.03 rows=3 width=4) (actual time=0.002..0.003 rows=3 loops=1)
         Filter: (verified_at IS NULL)
         Buffers: shared hit=1
 Planning:
   Buffers: shared hit=4
 Planning Time: 0.025 ms
 Execution Time: 0.007 ms
--- 6a. count(filter) каталога: опубликованные
                                             QUERY PLAN
-----------------------------------------------------------------------------------------------------
 Aggregate  (cost=2.09..2.10 rows=1 width=8) (actual time=0.011..0.011 rows=1 loops=1)
   Buffers: shared hit=2
   ->  Seq Scan on clubs  (cost=0.00..2.08 rows=6 width=0) (actual time=0.007..0.010 rows=3 loops=1)
         Filter: ((status)::text = 'published'::text)
         Buffers: shared hit=2
 Planning Time: 0.045 ms
 Execution Time: 0.021 ms
--- 6b. count(filter) каталога: опубликованные + город
                                             QUERY PLAN
-----------------------------------------------------------------------------------------------------
 Aggregate  (cost=2.09..2.10 rows=1 width=8) (actual time=0.005..0.005 rows=1 loops=1)
   Buffers: shared hit=2
   ->  Seq Scan on clubs  (cost=0.00..2.09 rows=1 width=0) (actual time=0.005..0.005 rows=0 loops=1)
         Filter: (((status)::text = 'published'::text) AND ((city)::text = 'Тольятти'::text))
         Rows Removed by Filter: 3
         Buffers: shared hit=2
 Planning Time: 0.029 ms
 Execution Time: 0.010 ms
--- 6c. count(filter) каталога: опубликованные + вид спорта (Prisma some → IN по связующей)
                                                      QUERY PLAN
-----------------------------------------------------------------------------------------------------------------------
 Aggregate  (cost=3.31..3.32 rows=1 width=8) (actual time=0.011..0.012 rows=1 loops=1)
   Buffers: shared hit=3
   ->  Hash Join  (cost=1.20..3.30 rows=2 width=0) (actual time=0.009..0.011 rows=2 loops=1)
         Hash Cond: (clubs.id = club_sports.club_id)
         Buffers: shared hit=3
         ->  Seq Scan on clubs  (cost=0.00..2.08 rows=6 width=4) (actual time=0.003..0.004 rows=3 loops=1)
               Filter: ((status)::text = 'published'::text)
               Buffers: shared hit=2
         ->  Hash  (cost=1.18..1.18 rows=2 width=4) (actual time=0.003..0.004 rows=2 loops=1)
               Buckets: 1024  Batches: 1  Memory Usage: 9kB
               Buffers: shared hit=1
               ->  Seq Scan on club_sports  (cost=0.00..1.18 rows=2 width=4) (actual time=0.002..0.002 rows=2 loops=1)
                     Filter: (sport_id = 7)
                     Rows Removed by Filter: 6
                     Buffers: shared hit=1
 Planning Time: 0.086 ms
 Execution Time: 0.020 ms
--- 6d. count(filter) каталога: тренеры, опубликованные + вид спорта
                                                     QUERY PLAN
--------------------------------------------------------------------------------------------------------------------
 Aggregate  (cost=2.13..2.14 rows=1 width=8) (actual time=0.003..0.003 rows=1 loops=1)
   Buffers: shared hit=1
   ->  Nested Loop  (cost=0.00..2.13 rows=1 width=0) (actual time=0.002..0.002 rows=0 loops=1)
         Join Filter: (trainers.id = trainer_sports.trainer_id)
         Buffers: shared hit=1
         ->  Seq Scan on trainer_sports  (cost=0.00..1.05 rows=1 width=4) (actual time=0.002..0.002 rows=0 loops=1)
               Filter: (sport_id = 7)
               Rows Removed by Filter: 4
               Buffers: shared hit=1
         ->  Seq Scan on trainers  (cost=0.00..1.04 rows=3 width=4) (never executed)
               Filter: ((status)::text = 'published'::text)
 Planning:
   Buffers: shared hit=19
 Planning Time: 0.075 ms
 Execution Time: 0.008 ms
```

</details>
