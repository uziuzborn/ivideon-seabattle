# Финальная установка Ivideon Sea Battle

## Что входит

- `index.html` — публичное онлайн-табло с выбором игры.
- `admin.html` — онлайн-админка. После входа всегда открывает **③ Статистика**.
- `config.js` — подключение к Supabase.
- `multi-admin-migration.sql` — добавление всех разрешённых администраторов.
- `admin-emails.txt` — список email.
- `.nojekyll` — настройка GitHub Pages.

## 1. Обновить файлы GitHub

1. Распаковать архив.
2. Открыть: `https://github.com/uziuzborn/ivideon-seabattle`
3. Нажать **Add file → Upload files**.
4. Перетащить **все файлы из распакованной папки** в корень репозитория.
5. Подтвердить замену существующих файлов.
6. Выбрать **Commit directly to the main branch**.
7. Нажать **Commit changes**.

Если GitHub Pages уже подключён к `main` / `/(root)`, повторно настраивать его не нужно.

Публичное табло:
`https://uziuzborn.github.io/ivideon-seabattle/`

Админка:
`https://uziuzborn.github.io/ivideon-seabattle/admin.html`

## 2. Запустить миграцию Supabase

1. Открыть Supabase → **SQL Editor → New query**.
2. Открыть локальный файл `multi-admin-migration.sql`.
3. Скопировать его целиком в SQL Editor.
4. Нажать **Run**.
5. В результате будет показано, для каких email уже созданы Auth-пользователи.

Миграция добавляет в список администраторов:

- a.umarov@ivideon.com
- andrey@ivideon.com
- v.gvarishvili@ivideon.com
- m.klyukvina@ivideon.com
- m.demidenok@ivideon.com
- k.savchenko@ivideon.com
- a.vinogradova@ivideon.com
- a.lepeshkin@ivideon.com
- z.abutalimov@ivideon.com
- n.drozdova@ivideon.com
- e.fedorova@ivideon.com
- t.ataev@ivideon.com
- a.kulinich@ivideon.com

## 3. Создать пользователей и пароли

SQL не может безопасно создать пароли пользователей через обычную миграцию. Поэтому каждого пользователя нужно создать в интерфейсе:

1. Supabase → **Authentication → Users**.
2. **Add user → Create new user**.
3. Ввести email.
4. Ввести выбранный пароль.
5. Включить **Auto Confirm User**, если настройка доступна.
6. Нажать **Create user**.

Повторить для всех email.

Одинаковый пароль технически возможен, но лучше использовать его как временный.

## 4. Проверить пользователей

После создания пользователей снова выполнить в SQL Editor:

```sql
select
  a.email,
  case when u.id is null then 'Нужно создать в Authentication → Users' else 'Готово' end as auth_status
from public.seabattle_admins a
left join auth.users u on lower(u.email) = a.email
order by a.email;
```

У всех должен быть статус `Готово`.

## 5. Первый вход и проверка

1. Открыть `admin.html`.
2. Войти под `a.umarov@ivideon.com`.
3. После входа должна открыться вкладка **③ Статистика**.
4. Открыть публичное табло во второй вкладке или на телефоне.
5. Создать/изменить игру в админке.
6. Дождаться статуса **Сохранено онлайн**.
7. Проверить, что публичное табло обновилось.

## 6. Как администратору создать свою игру

1. Войти в админку.
2. Открыть **⑤ Игры**.
3. Ввести название и создать игру.
4. Открыть **① Настройка**.
5. Настроить показатели для выстрела:
   - добавить новые;
   - переименовать;
   - включить/выключить;
   - сделать обязательными;
   - задать единицы и пороги.
6. Добавить участников.
7. Расставить корабли и запечатать поле.
8. Делать выстрелы во вкладке **② Выстрел недели**.

Без заполнения обязательных показателей выстрел не совершается.

## 7. Как посетителю выбрать игру

На публичном табло в шапке есть список **Игра**. Выбор сохраняется в браузере конкретного посетителя и не меняет игру у других пользователей.

## Безопасность

Не публиковать и не пересылать:

- Supabase secret key;
- `service_role`;
- пароль базы данных;
- пароли администраторов.

Publishable key в `config.js` является клиентским ключом; права записи ограничиваются RLS и списком `seabattle_admins`.
