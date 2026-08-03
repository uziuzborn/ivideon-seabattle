# Supabase · обновление публичного снимка

Этот каталог содержит **одно** изменение на стороне сервера. Оно **не обязательно**
для запуска редизайна: клиент работает и со старым снимком. Оно нужно только чтобы
на публичном табло полностью отображался результат **«фрагмент сокровища + неожиданная находка»**.

> Ничего из этого не было применено к production. Схема БД не меняется:
> ни таблиц, ни колонок, ни RLS-политик, ни Auth.

---

## 1. Что именно нужно поменять

`public_games.public_state` строится на сервере из приватного `games.state`.
Прежняя проекция отдавала `perkLabel` только когда `result === 'perk'`, поэтому
находка, найденная в секторе с фрагментом сокровища, в публичный снимок не попадала.

Файл [`functions/platform-admin/public-snapshot.ts`](functions/platform-admin/public-snapshot.ts)
содержит готовую чистую функцию `buildPublicState(state)`, которая:

- сохраняет **все прежние поля** снимка с прежними именами (старый клиент не ломается);
- добавляет безопасные поля найденной находки: `findLabel`, `findDesc`, `findIcon`,
  `findEffectPublic`, `findPrize`;
- добавляет `shipSize`, `scenarioName`, `periodStart`, `periodEnd`;
- **никогда** не отдаёт `cells`, `salt`, `bonusGrants`, `findLog`, `scenarios`,
  `ownerEmail`, `effectConfig`, координаты и факт существования ненайденных находок,
  награду незавершённого сокровища.

---

## 2. Сначала определите, где собирается снимок

Выполните в SQL Editor:

```sql
select table_name, table_type
from information_schema.tables
where table_schema = 'public' and table_name = 'public_games';
```

- `BASE TABLE` → снимок пишет Edge Function `platform-admin` → **вариант A**;
- `VIEW` → снимок собирает SQL-представление → **вариант B**.

---

## 3. Вариант A — Edge Function `platform-admin`

Обновляется **существующая** функция. Новый slug не создаётся,
`clever-endpoint` не используется.

1. Скачайте текущий код функции, чтобы иметь точку отката:

   ```bash
   supabase functions download platform-admin --project-ref teyilcysjsvitpkwyxom
   cp -r supabase/functions/platform-admin supabase/functions/platform-admin.backup
   ```

2. Положите `public-snapshot.ts` рядом с `index.ts` функции.

3. В `index.ts` добавьте импорт:

   ```ts
   import { buildPublicState } from "./public-snapshot.ts";
   ```

4. Найдите место, где сейчас формируется объект для `public_games.public_state`
   (обычно внутри `save_game` / `set_game_status` / общей функции публикации —
   ищите по строке `public_state`). Замените построение объекта на вызов:

   ```ts
   const publicState = buildPublicState(state);
   ```

   и дальше используйте `publicState` там, где раньше использовался
   собранный вручную объект. Остальная логика функции — авторизация, права,
   версии, optimistic locking — **не трогается**.

5. Задеплойте:

   ```bash
   supabase functions deploy platform-admin --project-ref teyilcysjsvitpkwyxom
   ```

6. Проверьте: проведите одно открытие сектора, где на сокровище лежит находка,
   и убедитесь, что на публичном табло видно и фрагмент, и находку.

**Откат:** задеплойте сохранённую копию `platform-admin.backup`.

---

## 4. Вариант B — представление `public_games`

Если `public_games` оказалось представлением, логика проекции живёт в SQL.
Портировать `buildPublicState` в SQL целиком не нужно: достаточно добавить
недостающие поля находки в существующее выражение, которое собирает `shots`.

Точный текст представления сначала посмотрите так:

```sql
select pg_get_viewdef('public.public_games'::regclass, true);
```

и добавьте в проекцию каждого элемента `shots` поля `findLabel`, `findDesc`,
`findIcon`, `findEffectPublic`, `findPrize`, беря их из
`state->'cells'->(r || ',' || c)->'find'` **только** при непустом
`find->>'consumedAt'`. Все существующие поля оставьте без изменений.

Изменение оформляется как `CREATE OR REPLACE VIEW` — идемпотентно и обратимо
повторным `CREATE OR REPLACE VIEW` с прежним текстом.

---

## 5. Если сервер не обновлять

Всё продолжает работать:

- редактор фиксирует находку, выдаёт эффект и пишет её в историю исследований;
- лопата и остальные эффекты работают;
- публичное табло показывает результат сокровища, но не покажет находку,
  найденную в том же секторе.

Клиент написан устойчиво: новые поля читаются, только если они есть в снимке.
