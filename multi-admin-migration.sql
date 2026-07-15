-- Ivideon Sea Battle: список администраторов
-- Запусти один раз в Supabase SQL Editor.

begin;

create table if not exists public.seabattle_admins (
  email text primary key,
  added_at timestamptz not null default now(),
  constraint seabattle_admin_email_lowercase check (email = lower(email))
);

alter table public.seabattle_admins enable row level security;

-- Список администраторов закрыт от публичного API.
revoke all on public.seabattle_admins from anon, authenticated;

insert into public.seabattle_admins (email)
values
  ('a.umarov@ivideon.com'),
  ('andrey@ivideon.com'),
  ('v.gvarishvili@ivideon.com'),
  ('m.klyukvina@ivideon.com'),
  ('m.demidenok@ivideon.com'),
  ('k.savchenko@ivideon.com'),
  ('a.vinogradova@ivideon.com'),
  ('a.lepeshkin@ivideon.com'),
  ('z.abutalimov@ivideon.com'),
  ('n.drozdova@ivideon.com'),
  ('e.fedorova@ivideon.com'),
  ('t.ataev@ivideon.com'),
  ('a.kulinich@ivideon.com')
on conflict (email) do nothing;

-- Проверка прав по email авторизованного пользователя.
create or replace function public.is_seabattle_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.seabattle_admins a
    where a.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.is_seabattle_admin() from public;
grant execute on function public.is_seabattle_admin() to authenticated;

commit;

-- Проверка списка администраторов и наличия Auth-пользователей.
select
  a.email,
  case when u.id is null then 'Нужно создать в Authentication → Users' else 'Готово' end as auth_status
from public.seabattle_admins a
left join auth.users u on lower(u.email) = a.email
order by a.email;
