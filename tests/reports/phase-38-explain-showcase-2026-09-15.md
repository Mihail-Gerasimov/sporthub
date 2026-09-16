<!-- Отчёт EXPLAIN витринных запросов — фаза 38, шаг 38.32. -->

# EXPLAIN витрины главной — 15.09.2026

**Стенд:** схема `explain_showcase` на тестовой базе `sporthub_test` (миграции штатные),
по 5000 строк в `clubs`, `trainers`, `users`, `reviews`; каждая десятая публикация
скрыта, каждый сотый человек — администратор. Схема удалена после снятия планов.
Живая база (3 клуба, 3 тренера) для планов непригодна: на трёх строках планировщик
всегда выбирает полный перебор.

**Запросы** — те, что уходят из `PrismaClubsRepository.findAll` / `count` и
`PrismaTrainersRepository.findAll` / `count` по вызовам витрины
(`sort=rating&limit=6`, `limit=4`, `limit=1`) и из `GET /api/stats/overview`.

## Находка: предикат `<> 'hidden'` обходил индекс

Публичный отбор писался как `status <> 'hidden'` с оговоркой в коде «btree не работает
на «не равно», оставлено осознанно». Пока выдача читалась целиком, оговорка была верна.
Витрина спрашивает шесть лучших — и вот что делала база:

| Запрос                 | Предикат `<> 'hidden'`                                          | Предикат `= 'published'`                                                                                         |
| ---------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| шесть лучших клубов    | Seq Scan 4500 строк → top-N heapsort, **0,716 мс**, 125 буферов | Index Scan `clubs_status_rating_review_count_idx` → Incremental Sort, **7 строк прочитано**, 0,040 мс, 9 буферов |
| четыре лучших тренера  | Seq Scan 4500 → top-N heapsort, 0,597 мс                        | Index Scan `trainers_status_rating_review_count_idx`, 5 строк, 0,023 мс                                          |
| лидер, `limit=1`       | Seq Scan 4500 → top-N heapsort, 0,710 мс                        | Index Scan, 2 строки, 0,012 мс                                                                                   |
| `count` клубов         | Seq Scan, 0,602 мс                                              | Index Only Scan `clubs_status_created_at_idx`, 0,302 мс                                                          |
| `count` тренеров       | Seq Scan, 0,511 мс                                              | Index Only Scan `trainers_status_created_at_idx`, 0,294 мс                                                       |
| `count` людей `person` | Seq Scan, 0,531 мс                                              | Seq Scan, 0,516 мс — индекса нет намеренно, см. ниже                                                             |
| `count` отзывов        | Seq Scan, 0,315 мс                                              | то же — предиката нет                                                                                            |

**Сделано (шаг 38.32):** `buildPublicationWhere` пишет `status = 'published'`
(`apps/api/src/repositories/prisma/entities.repository.ts`). Смысл не изменился:
третье значение `draft` площадка не заводит нигде — писателя у него нет, — а если
бы завела, черновику на витрине не место. Закреплено тестом «публичная выдача —
только опубликованное: черновик не показывается» в `entities.repository.test.ts`;
сверка контрактов (54 вызова) и все наборы каталога — зелёные без правок.

**Порядок** — `rating DESC, review_count DESC, id ASC`: индекс даёт первые два ключа,
`id` добавляет Incremental Sort поверх — это и есть вторичный ключ, без которого
верхушка у равных рейтингов мигала бы (тест «верхушка limit=1 совпадает с первой
строкой полной сортированной выдачи» в `clubs.controller.test.ts`).

## Счётчики героя

Четыре `COUNT` на запрос, все в базе (сторож «не из длины массива» в
`stats.controller.test.ts`). Два по индексам, два обходом таблицы:

- `users.account_kind = 'person'` — индекса нет **намеренно**: значений два, почти все
  строки — `person`; по такой колонке база индекс не возьмёт, а вставку он бы удорожил.
- `reviews` — предиката нет, `count(*)` по таблице.

Цена на 5000 строк — ~1,4 мс на все четыре. Порог кэширования назван в комментарии
контроллера: при нагрузке на главную свыше ~50 запросов/с — кэш на 60 секунд у самого
маршрута; до того кэш — абстракция впрок.

## Планы целиком

<details>
<summary>до смены предиката</summary>

```
--- витрина: шесть лучших клубов
                                                     QUERY PLAN
--------------------------------------------------------------------------------------------------------------------
 Limit  (cost=268.16..268.18 rows=6 width=16) (actual time=0.710..0.711 rows=6 loops=1)
   Buffers: shared hit=125
   ->  Sort  (cost=268.16..279.41 rows=4500 width=16) (actual time=0.709..0.710 rows=6 loops=1)
         Sort Key: rating DESC, review_count DESC, id
         Sort Method: top-N heapsort  Memory: 25kB
         Buffers: shared hit=125
         ->  Seq Scan on clubs  (cost=0.00..187.50 rows=4500 width=16) (actual time=0.003..0.503 rows=4500 loops=1)
               Filter: ((status)::text <> 'hidden'::text)
               Rows Removed by Filter: 500
               Buffers: shared hit=125
 Planning:
   Buffers: shared hit=120
 Planning Time: 0.100 ms
 Execution Time: 0.716 ms
(14 rows)

--- витрина: четыре лучших тренера
                                                      QUERY PLAN
-----------------------------------------------------------------------------------------------------------------------
 Limit  (cost=212.00..212.01 rows=4 width=16) (actual time=0.593..0.593 rows=4 loops=1)
   Buffers: shared hit=82
   ->  Sort  (cost=212.00..223.25 rows=4500 width=16) (actual time=0.592..0.593 rows=4 loops=1)
         Sort Key: rating DESC, review_count DESC, id
         Sort Method: top-N heapsort  Memory: 25kB
         Buffers: shared hit=82
         ->  Seq Scan on trainers  (cost=0.00..144.50 rows=4500 width=16) (actual time=0.003..0.400 rows=4500 loops=1)
               Filter: ((status)::text <> 'hidden'::text)
               Rows Removed by Filter: 500
               Buffers: shared hit=82
 Planning:
   Buffers: shared hit=94 read=1
 Planning Time: 0.098 ms
 Execution Time: 0.597 ms
(14 rows)

--- лидер: limit 1
                                                     QUERY PLAN
--------------------------------------------------------------------------------------------------------------------
 Limit  (cost=210.00..210.00 rows=1 width=16) (actual time=0.707..0.708 rows=1 loops=1)
   Buffers: shared hit=125
   ->  Sort  (cost=210.00..221.25 rows=4500 width=16) (actual time=0.707..0.707 rows=1 loops=1)
         Sort Key: rating DESC, review_count DESC, id
         Sort Method: top-N heapsort  Memory: 25kB
         Buffers: shared hit=125
         ->  Seq Scan on clubs  (cost=0.00..187.50 rows=4500 width=16) (actual time=0.001..0.497 rows=4500 loops=1)
               Filter: ((status)::text <> 'hidden'::text)
               Rows Removed by Filter: 500
               Buffers: shared hit=125
 Planning:
   Buffers: shared hit=1
 Planning Time: 0.014 ms
 Execution Time: 0.710 ms
(14 rows)

--- счётчики героя
                                                 QUERY PLAN
-------------------------------------------------------------------------------------------------------------
 Aggregate  (cost=198.75..198.76 rows=1 width=8) (actual time=0.598..0.598 rows=1 loops=1)
   Buffers: shared hit=125
   ->  Seq Scan on clubs  (cost=0.00..187.50 rows=4500 width=0) (actual time=0.001..0.484 rows=4500 loops=1)
         Filter: ((status)::text <> 'hidden'::text)
         Rows Removed by Filter: 500
         Buffers: shared hit=125
 Planning:
   Buffers: shared hit=7
 Planning Time: 0.025 ms
 Execution Time: 0.602 ms
(10 rows)

                                                   QUERY PLAN
----------------------------------------------------------------------------------------------------------------
 Aggregate  (cost=155.75..155.76 rows=1 width=8) (actual time=0.508..0.508 rows=1 loops=1)
   Buffers: shared hit=82
   ->  Seq Scan on trainers  (cost=0.00..144.50 rows=4500 width=0) (actual time=0.001..0.402 rows=4500 loops=1)
         Filter: ((status)::text <> 'hidden'::text)
         Rows Removed by Filter: 500
         Buffers: shared hit=82
 Planning:
   Buffers: shared hit=4
 Planning Time: 0.017 ms
 Execution Time: 0.511 ms
(10 rows)

                                                 QUERY PLAN
-------------------------------------------------------------------------------------------------------------
 Aggregate  (cost=145.88..145.88 rows=1 width=8) (actual time=0.527..0.528 rows=1 loops=1)
   Buffers: shared hit=71
   ->  Seq Scan on users  (cost=0.00..133.50 rows=4950 width=0) (actual time=0.002..0.395 rows=4950 loops=1)
         Filter: ((account_kind)::text = 'person'::text)
         Rows Removed by Filter: 50
         Buffers: shared hit=71
 Planning:
   Buffers: shared hit=28
 Planning Time: 0.033 ms
 Execution Time: 0.531 ms
(10 rows)

                                                  QUERY PLAN
--------------------------------------------------------------------------------------------------------------
 Aggregate  (cost=104.50..104.51 rows=1 width=8) (actual time=0.312..0.312 rows=1 loops=1)
   Buffers: shared hit=42
   ->  Seq Scan on reviews  (cost=0.00..92.00 rows=5000 width=0) (actual time=0.002..0.185 rows=5000 loops=1)
         Buffers: shared hit=42
 Planning:
   Buffers: shared hit=78
 Planning Time: 0.052 ms
 Execution Time: 0.315 ms
(8 rows)

```

</details>

<details>
<summary>после смены предиката</summary>

```
--- витрина: шесть лучших клубов (status = published)
                                                                          QUERY PLAN
--------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=1.57..2.52 rows=6 width=16) (actual time=0.030..0.031 rows=6 loops=1)
   Buffers: shared hit=9
   ->  Incremental Sort  (cost=1.57..711.51 rows=4500 width=16) (actual time=0.029..0.030 rows=6 loops=1)
         Sort Key: rating DESC, review_count DESC, id
         Presorted Key: rating, review_count
         Full-sort Groups: 1  Sort Method: quicksort  Average Memory: 25kB  Peak Memory: 25kB
         Buffers: shared hit=9
         ->  Index Scan using clubs_status_rating_review_count_idx on clubs  (cost=0.28..573.99 rows=4500 width=16) (actual time=0.019..0.024 rows=7 loops=1)
               Index Cond: ((status)::text = 'published'::text)
               Buffers: shared hit=9
 Planning:
   Buffers: shared hit=62
 Planning Time: 0.110 ms
 Execution Time: 0.040 ms
(14 rows)

--- витрина: четыре лучших тренера
                                                                             QUERY PLAN
--------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=1.33..1.85 rows=4 width=16) (actual time=0.020..0.020 rows=4 loops=1)
   Buffers: shared hit=7
   ->  Incremental Sort  (cost=1.33..589.99 rows=4500 width=16) (actual time=0.019..0.019 rows=4 loops=1)
         Sort Key: rating DESC, review_count DESC, id
         Presorted Key: rating, review_count
         Full-sort Groups: 1  Sort Method: quicksort  Average Memory: 25kB  Peak Memory: 25kB
         Buffers: shared hit=7
         ->  Index Scan using trainers_status_rating_review_count_idx on trainers  (cost=0.28..456.22 rows=4500 width=16) (actual time=0.012..0.017 rows=5 loops=1)
               Index Cond: ((status)::text = 'published'::text)
               Buffers: shared hit=7
 Planning:
   Buffers: shared hit=36
 Planning Time: 0.057 ms
 Execution Time: 0.023 ms
(14 rows)

--- лидер: limit 1
                                                                          QUERY PLAN
--------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=1.47..1.62 rows=1 width=16) (actual time=0.007..0.007 rows=1 loops=1)
   Buffers: shared hit=4
   ->  Incremental Sort  (cost=1.47..662.76 rows=4500 width=16) (actual time=0.007..0.007 rows=1 loops=1)
         Sort Key: rating DESC, review_count DESC, id
         Presorted Key: rating, review_count
         Full-sort Groups: 1  Sort Method: quicksort  Average Memory: 25kB  Peak Memory: 25kB
         Buffers: shared hit=4
         ->  Index Scan using clubs_status_rating_review_count_idx on clubs  (cost=0.28..573.99 rows=4500 width=16) (actual time=0.005..0.005 rows=2 loops=1)
               Index Cond: ((status)::text = 'published'::text)
               Buffers: shared hit=4
 Planning:
   Buffers: shared hit=1
 Planning Time: 0.028 ms
 Execution Time: 0.012 ms
(14 rows)

--- счётчики героя
                                                                      QUERY PLAN
------------------------------------------------------------------------------------------------------------------------------------------------------
 Aggregate  (cost=118.28..118.29 rows=1 width=8) (actual time=0.293..0.293 rows=1 loops=1)
   Buffers: shared hit=6
   ->  Index Only Scan using clubs_status_created_at_idx on clubs  (cost=0.28..107.03 rows=4500 width=0) (actual time=0.007..0.180 rows=4500 loops=1)
         Index Cond: (status = 'published'::text)
         Heap Fetches: 0
         Buffers: shared hit=6
 Planning:
   Buffers: shared hit=4
 Planning Time: 0.023 ms
 Execution Time: 0.302 ms
(10 rows)

                                                                         QUERY PLAN
------------------------------------------------------------------------------------------------------------------------------------------------------------
 Aggregate  (cost=118.28..118.29 rows=1 width=8) (actual time=0.291..0.291 rows=1 loops=1)
   Buffers: shared hit=6
   ->  Index Only Scan using trainers_status_created_at_idx on trainers  (cost=0.28..107.03 rows=4500 width=0) (actual time=0.016..0.180 rows=4500 loops=1)
         Index Cond: (status = 'published'::text)
         Heap Fetches: 0
         Buffers: shared hit=6
 Planning:
   Buffers: shared hit=1
 Planning Time: 0.014 ms
 Execution Time: 0.294 ms
(10 rows)

                                                 QUERY PLAN
-------------------------------------------------------------------------------------------------------------
 Aggregate  (cost=145.88..145.88 rows=1 width=8) (actual time=0.513..0.513 rows=1 loops=1)
   Buffers: shared hit=71
   ->  Seq Scan on users  (cost=0.00..133.50 rows=4950 width=0) (actual time=0.002..0.397 rows=4950 loops=1)
         Filter: ((account_kind)::text = 'person'::text)
         Rows Removed by Filter: 50
         Buffers: shared hit=71
 Planning:
   Buffers: shared hit=7
 Planning Time: 0.011 ms
 Execution Time: 0.516 ms
(10 rows)

                                                  QUERY PLAN
--------------------------------------------------------------------------------------------------------------
 Aggregate  (cost=104.50..104.51 rows=1 width=8) (actual time=0.283..0.283 rows=1 loops=1)
   Buffers: shared hit=42
   ->  Seq Scan on reviews  (cost=0.00..92.00 rows=5000 width=0) (actual time=0.001..0.164 rows=5000 loops=1)
         Buffers: shared hit=42
 Planning:
   Buffers: shared hit=23
 Planning Time: 0.032 ms
 Execution Time: 0.285 ms
(8 rows)

```

</details>

## Популярные виды спорта — `GET /api/sports?popular=<n>` (шаг 38.68, 16.09.2026)

**Стенд:** схема `explain_sports` на `sporthub_test`: 30 видов, 5000 клубов и 5000 карточек
тренеров (каждая десятая скрыта), 9 667 строк `club_sports`, 5 000 строк `trainer_sports`.
Схема удалена после снятия плана.

**Запрос** — тот, что уходит из `PrismaSportsRepository.findPopular`: два подсчёта
по связующим таблицам (`JOIN … status = 'published'`, `GROUP BY sport_id`), сложенные
у вида, `ORDER BY count DESC, id ASC LIMIT n`.

**План:** Hash Join `club_sports` × `clubs` → HashAggregate по виду (то же для тренеров),
Sort top-N по счёту и номеру, Limit. **3,78 мс**, буферов ~330.

**Индекса не заводится — и это названо, а не забыто.** Индексы `club_sports(sport_id)`,
`trainer_sports(sport_id)` и `clubs(status)` / `trainers(status)` есть, планировщик их
не берёт — и прав: популярность считается по ВСЕМ опубликованным публикациям, то есть
обход связующих таблиц целиком неизбежен по смыслу запроса, а отсев `status = 'published'`
оставляет 90 % строк. Индекс ничего не отбросил бы. Цена растёт линейно с числом
публикаций (≈0,4 мс на тысячу); порог назван в контроллере: при десятках тысяч публикаций —
кэш на 60 секунд у маршрута, как у `/stats/overview`, а не индекс.

<details>
<summary>план целиком</summary>

```
--- популярные виды: top 8
                                                                           QUERY PLAN
----------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=767.49..767.51 rows=8 width=8) (actual time=3.742..3.744 rows=8 loops=1)
   Buffers: shared hit=274
   ->  Sort  (cost=767.49..767.57 rows=30 width=8) (actual time=3.741..3.742 rows=8 loops=1)
         Sort Key: (((COALESCE(c.cnt, '0'::bigint) + COALESCE(t.cnt, '0'::bigint)))::integer) DESC, s.id
         Sort Method: top-N heapsort  Memory: 25kB
         Buffers: shared hit=274
         ->  Hash Left Join  (cost=766.05..766.89 rows=30 width=8) (actual time=3.729..3.738 rows=30 loops=1)
               Hash Cond: (s.id = t.sport_id)
               Buffers: shared hit=274
               ->  Merge Left Join  (cost=455.69..456.29 rows=30 width=12) (actual time=2.234..2.240 rows=30 loops=1)
                     Merge Cond: (s.id = c.sport_id)
                     Buffers: shared hit=169
                     ->  Sort  (cost=2.04..2.11 rows=30 width=4) (actual time=0.009..0.010 rows=30 loops=1)
                           Sort Key: s.id
                           Sort Method: quicksort  Memory: 25kB
                           Buffers: shared hit=1
                           ->  Seq Scan on sports s  (cost=0.00..1.30 rows=30 width=4) (actual time=0.003..0.004 rows=30 loops=1)
                                 Buffers: shared hit=1
                     ->  Sort  (cost=453.65..453.73 rows=30 width=12) (actual time=2.224..2.225 rows=27 loops=1)
                           Sort Key: c.sport_id
                           Sort Method: quicksort  Memory: 26kB
                           Buffers: shared hit=168
                           ->  Subquery Scan on c  (cost=452.32..452.92 rows=30 width=12) (actual time=2.218..2.221 rows=27 loops=1)
                                 Buffers: shared hit=168
                                 ->  HashAggregate  (cost=452.32..452.62 rows=30 width=12) (actual time=2.217..2.220 rows=27 loops=1)
                                       Group Key: cs.sport_id
                                       Batches: 1  Memory Usage: 24kB
                                       Buffers: shared hit=168
                                       ->  Hash Join  (cost=243.75..408.82 rows=8700 width=4) (actual time=0.653..1.717 rows=8833 loops=1)
                                             Hash Cond: (cs.club_id = cl.id)
                                             Buffers: shared hit=168
                                             ->  Seq Scan on club_sports cs  (cost=0.00..139.67 rows=9667 width=8) (actual time=0.002..0.305 rows=9667 loops=1)
                                                   Buffers: shared hit=43
                                             ->  Hash  (cost=187.50..187.50 rows=4500 width=4) (actual time=0.648..0.648 rows=4500 loops=1)
                                                   Buckets: 8192  Batches: 1  Memory Usage: 223kB
                                                   Buffers: shared hit=125
                                                   ->  Seq Scan on clubs cl  (cost=0.00..187.50 rows=4500 width=4) (actual time=0.002..0.459 rows=4500 loops=1)
                                                         Filter: ((status)::text = 'published'::text)
                                                         Rows Removed by Filter: 500
                                                         Buffers: shared hit=125
               ->  Hash  (cost=309.99..309.99 rows=30 width=12) (actual time=1.493..1.493 rows=27 loops=1)
                     Buckets: 1024  Batches: 1  Memory Usage: 10kB
                     Buffers: shared hit=105
                     ->  Subquery Scan on t  (cost=309.39..309.99 rows=30 width=12) (actual time=1.488..1.491 rows=27 loops=1)
                           Buffers: shared hit=105
                           ->  HashAggregate  (cost=309.39..309.69 rows=30 width=12) (actual time=1.487..1.489 rows=27 loops=1)
                                 Group Key: ts.sport_id
                                 Batches: 1  Memory Usage: 24kB
                                 Buffers: shared hit=105
                                 ->  Hash Join  (cost=200.75..286.89 rows=4500 width=4) (actual time=0.695..1.236 rows=4500 loops=1)
                                       Hash Cond: (ts.trainer_id = tr.id)
                                       Buffers: shared hit=105
                                       ->  Seq Scan on trainer_sports ts  (cost=0.00..73.00 rows=5000 width=8) (actual time=0.001..0.165 rows=5000 loops=1)
                                             Buffers: shared hit=23
                                       ->  Hash  (cost=144.50..144.50 rows=4500 width=4) (actual time=0.678..0.678 rows=4500 loops=1)
                                             Buckets: 8192  Batches: 1  Memory Usage: 223kB
                                             Buffers: shared hit=82
                                             ->  Seq Scan on trainers tr  (cost=0.00..144.50 rows=4500 width=4) (actual time=0.002..0.431 rows=4500 loops=1)
                                                   Filter: ((status)::text = 'published'::text)
                                                   Rows Removed by Filter: 500
                                                   Buffers: shared hit=82
 Planning:
   Buffers: shared hit=348
 Planning Time: 0.400 ms
 Execution Time: 3.780 ms
(65 rows)
```

</details>
