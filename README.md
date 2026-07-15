# Морской бой · отдел по работе ПВЗ Ivideon

Онлайн-версия корпоративной игры с общей базой Supabase и публикацией через GitHub Pages.

## Файлы

- `index.html` — публичное онлайн-табло для команды.
- `admin.html` — закрытая админка с входом через Supabase Authentication.
- `config.js` — Project URL и publishable key Supabase.
- `.nojekyll` — отключает обработку Jekyll на GitHub Pages.

## Публикация

1. Загрузите все файлы в корень репозитория `ivideon-seabattle`.
2. Нажмите **Commit changes**.
3. Откройте **Settings → Pages**.
4. Выберите:
   - **Source:** Deploy from a branch
   - **Branch:** main
   - **Folder:** /(root)
5. Нажмите **Save**.

Публичное табло:

`https://uziuzborn.github.io/ivideon-seabattle/`

Админка:

`https://uziuzborn.github.io/ivideon-seabattle/admin.html`

## Первый запуск

1. Откройте `admin.html`.
2. Войдите под `a.umarov@ivideon.com` и паролем пользователя Supabase.
3. При первом входе админка создаст строки `main` в таблицах:
   - `game_private` — полное приватное состояние;
   - `game_public` — безопасное публичное состояние.
4. После любого изменения статус в шапке должен смениться на **«Сохранено онлайн»**.
5. Откройте публичное табло в другой вкладке или на телефоне. Изменения придут через Realtime; также предусмотрена контрольная загрузка раз в 30 секунд.

## Безопасность

В `config.js` находится только publishable key, который предназначен для клиентских приложений. Доступ ограничивается политиками Row Level Security.

Никогда не добавляйте в репозиторий:

- secret key;
- service_role key;
- пароль базы данных;
- пароль пользователя Supabase.

Публичная таблица не содержит скрытые координаты живых кораблей, соль и нераскрытые секретные призы.
