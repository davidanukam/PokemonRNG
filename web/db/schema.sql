create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists profiles (
  player_id uuid primary key references players (id) on delete cascade,
  name text not null default 'Trainer',
  xp integer not null default 0,
  opened integer not null default 0,
  avatar text not null default '',
  recent integer[] not null default '{}',
  updated_at timestamptz not null default now(),
  constraint profiles_name_len check (char_length(name) between 1 and 24),
  constraint profiles_xp_nonneg check (xp >= 0),
  constraint profiles_opened_nonneg check (opened >= 0),
  constraint profiles_avatar_len check (char_length(avatar) < 120000),
  constraint profiles_recent_len check (cardinality(recent) <= 8)
);

create table if not exists copies (
  player_id uuid not null references players (id) on delete cascade,
  card_id integer not null,
  condition smallint not null,
  count integer not null,
  primary key (player_id, card_id, condition),
  constraint copies_card_pos check (card_id > 0),
  constraint copies_condition_range check (condition between 0 and 4),
  constraint copies_count_pos check (count > 0)
);

create index if not exists copies_player_idx on copies (player_id);

alter table profiles enable row level security;
alter table profiles force row level security;
alter table copies enable row level security;
alter table copies force row level security;

drop policy if exists profiles_own on profiles;
create policy profiles_own on profiles
  for all
  using (player_id = nullif(current_setting('pokerng.player_id', true), '')::uuid)
  with check (player_id = nullif(current_setting('pokerng.player_id', true), '')::uuid);

drop policy if exists copies_own on copies;
create policy copies_own on copies
  for all
  using (player_id = nullif(current_setting('pokerng.player_id', true), '')::uuid)
  with check (player_id = nullif(current_setting('pokerng.player_id', true), '')::uuid);

create or replace function public.load_player(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pid uuid;
  result jsonb;
begin
  if p_token_hash is null or char_length(p_token_hash) <> 64 then
    raise exception 'bad token';
  end if;

  insert into players (token_hash)
  values (p_token_hash)
  on conflict (token_hash) do update set token_hash = excluded.token_hash
  returning id into pid;

  insert into profiles (player_id)
  values (pid)
  on conflict (player_id) do nothing;

  select jsonb_build_object(
    'name', profiles.name,
    'xp', profiles.xp,
    'opened', profiles.opened,
    'avatar', profiles.avatar,
    'recent', to_jsonb(profiles.recent),
    'copies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'card_id', copies.card_id,
        'condition', copies.condition,
        'count', copies.count
      ))
      from copies
      where copies.player_id = pid
    ), '[]'::jsonb)
  )
  into result
  from profiles
  where profiles.player_id = pid;

  return result;
end;
$$;

create or replace function public.save_player(
  p_token_hash text,
  p_name text,
  p_xp integer,
  p_opened integer,
  p_avatar text,
  p_recent integer[],
  p_copies jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pid uuid;
  copy_rows bigint;
begin
  if p_token_hash is null or char_length(p_token_hash) <> 64 then
    raise exception 'bad token';
  end if;
  if p_name is null or char_length(btrim(p_name)) < 1 or char_length(btrim(p_name)) > 24 then
    raise exception 'bad name';
  end if;
  if p_xp is null or p_xp < 0 or p_opened is null or p_opened < 0 then
    raise exception 'bad progress';
  end if;
  if p_avatar is null or char_length(p_avatar) >= 120000 then
    raise exception 'bad avatar';
  end if;
  if p_recent is null or cardinality(p_recent) > 8 then
    raise exception 'bad recent';
  end if;
  if p_copies is null or jsonb_typeof(p_copies) <> 'array' then
    raise exception 'bad copies';
  end if;

  select count(*) into copy_rows from jsonb_array_elements(p_copies);
  if copy_rows > 50000 then
    raise exception 'too many copies';
  end if;

  insert into players (token_hash)
  values (p_token_hash)
  on conflict (token_hash) do update set token_hash = excluded.token_hash
  returning id into pid;

  insert into profiles (player_id, name, xp, opened, avatar, recent)
  values (pid, btrim(p_name), p_xp, p_opened, p_avatar, p_recent)
  on conflict (player_id) do update set
    name = excluded.name,
    xp = excluded.xp,
    opened = excluded.opened,
    avatar = excluded.avatar,
    recent = excluded.recent,
    updated_at = now();

  delete from copies where player_id = pid;

  insert into copies (player_id, card_id, condition, count)
  select pid, card_id, condition, count
  from jsonb_to_recordset(p_copies) as row(card_id integer, condition integer, count integer)
  where card_id > 0
    and condition between 0 and 4
    and count > 0;
end;
$$;

revoke all on function public.load_player(text) from public;
revoke all on function public.save_player(text, text, integer, integer, text, integer[], jsonb) from public;
grant execute on function public.load_player(text) to pokerng_owner;
grant execute on function public.save_player(text, text, integer, integer, text, integer[], jsonb) to pokerng_owner;

-- The app connects as pokerng_app, which can only call these two functions.
-- pokerng_owner has BYPASSRLS, so the functions are what keep one player off another's rows.
grant usage on schema public to pokerng_app;
grant execute on function public.load_player(text) to pokerng_app;
grant execute on function public.save_player(text, text, integer, integer, text, integer[], jsonb) to pokerng_app;
