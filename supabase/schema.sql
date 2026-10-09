-- Execute uma vez no SQL Editor de um novo projeto Supabase.
begin;
create schema if not exists private;
create table private.admins (user_id uuid primary key references auth.users(id) on delete cascade);
alter table private.admins enable row level security;
create policy admins_no_client_access on private.admins as restrictive for all to anon, authenticated using (false) with check (false);
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to anon, authenticated;
revoke all on private.admins from public, anon, authenticated;

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  name text not null check (length(name) between 2 and 80),
  phone text not null check (phone ~ '^[0-9]{10,13}$'),
  numbers integer[] not null check (cardinality(numbers) between 1 and 10),
  status text not null default 'pending' check (status in ('pending','paid','cancelled')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);
create index reservations_user on public.reservations(user_id);
alter table public.reservations enable row level security;
revoke all on public.reservations from public, anon, authenticated;
grant select on public.reservations to authenticated;

create function private.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists(select 1 from private.admins where user_id = auth.uid()); $$;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;

create function public.is_admin() returns boolean
language sql stable security invoker set search_path = ''
as $$ select private.is_admin(); $$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create policy reservation_read on public.reservations for select to authenticated
using (user_id = (select auth.uid()) or (select public.is_admin()));

-- Retorna somente números e estados. Nunca expõe nomes, telefones ou códigos.
create function private.get_numbers() returns table(number integer, status text)
language sql stable security definer set search_path = ''
as $$
  select n, coalesce((select case when r.status = 'paid' then 'paid' else 'reserved' end
    from public.reservations r where n = any(r.numbers)
    and (r.status = 'paid' or (r.status = 'pending' and r.expires_at > now()))
    limit 1), 'available')
  from generate_series(1,100) n order by n;
$$;
revoke all on function private.get_numbers() from public;
grant execute on function private.get_numbers() to anon, authenticated;

create function public.get_numbers() returns table(number integer, status text)
language sql stable security invoker set search_path = ''
as $$ select * from private.get_numbers(); $$;
revoke all on function public.get_numbers() from public;
grant execute on function public.get_numbers() to anon, authenticated;

create function private.reserve_numbers(p_numbers integer[], p_name text, p_phone text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare result public.reservations; buyer uuid := auth.uid();
begin
  if buyer is null then raise exception 'Faça o acesso antes de reservar.'; end if;
  if p_numbers is null or cardinality(p_numbers) not between 1 and 10 or array_ndims(p_numbers) <> 1
    or exists(select 1 from unnest(p_numbers) n where n is null or n < 1 or n > 100)
    or (select count(distinct n) from unnest(p_numbers) n) <> cardinality(p_numbers)
    then raise exception 'Escolha de 1 a 10 números distintos entre 1 e 100.'; end if;
  if p_name is null or length(trim(p_name)) not between 2 and 80
    or p_phone is null or p_phone !~ '^[0-9]{10,13}$'
    then raise exception 'Informe nome e telefone válidos.'; end if;
  -- Todas as mudanças passam pelo mesmo lock: duas reservas concorrentes
  -- nunca podem confirmar o mesmo número. Não há escrita direta para clientes.
  perform pg_advisory_xact_lock(1001010);
  if exists(select 1 from public.reservations where numbers && p_numbers
    and (status = 'paid' or (status = 'pending' and expires_at > clock_timestamp())))
    then raise exception 'Um desses números já foi reservado. Atualize e escolha outro.'; end if;
  if (select coalesce(sum(cardinality(numbers)),0) from public.reservations
    where user_id = buyer and status = 'pending' and expires_at > clock_timestamp()) + cardinality(p_numbers) > 10
    then raise exception 'Você já tem reservas pendentes. Limite de 10 números por participante.'; end if;
  insert into public.reservations(user_id,name,phone,numbers,created_at,expires_at)
    values(buyer,trim(p_name),p_phone,p_numbers,clock_timestamp(),clock_timestamp()+interval '24 hours') returning * into result;
  return to_jsonb(result) - 'user_id';
end; $$;
revoke all on function private.reserve_numbers(integer[],text,text) from public, anon;
grant execute on function private.reserve_numbers(integer[],text,text) to authenticated;

create function public.reserve_numbers(p_numbers integer[], p_name text, p_phone text)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.reserve_numbers(p_numbers,p_name,p_phone); $$;
revoke all on function public.reserve_numbers(integer[],text,text) from public, anon;
grant execute on function public.reserve_numbers(integer[],text,text) to authenticated;

create function private.admin_update_reservation(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_admin() then raise exception 'Acesso restrito ao organizador.'; end if;
  if p_status is null or p_status not in ('paid','cancelled') then raise exception 'Estado inválido.'; end if;
  perform pg_advisory_xact_lock(1001010);
  update public.reservations set status = p_status
    where id = p_id and status = 'pending' and expires_at > clock_timestamp();
  if not found then raise exception 'Reserva inexistente, expirada ou já processada.'; end if;
end; $$;
revoke all on function private.admin_update_reservation(uuid,text) from public, anon;
grant execute on function private.admin_update_reservation(uuid,text) to authenticated;

create function public.admin_update_reservation(p_id uuid, p_status text)
returns void language sql security invoker set search_path = ''
as $$ select private.admin_update_reservation(p_id,p_status); $$;
revoke all on function public.admin_update_reservation(uuid,text) from public, anon;
grant execute on function public.admin_update_reservation(uuid,text) to authenticated;
commit;
