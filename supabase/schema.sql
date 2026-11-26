-- Banco do app de pesca (Supabase). Rodar uma vez em: SQL Editor > New query > colar tudo > Run.
-- Regra principal: cada pessoa só vê e mexe nas pescarias em que entrou (criou ou recebeu convite).

create table if not exists public.pescarias (
  id uuid primary key default gen_random_uuid(),
  dono uuid not null references auth.users(id) on delete cascade,
  convite text not null unique default encode(gen_random_bytes(12), 'hex'),
  dados jsonb not null,
  versao int not null default 1,
  criado timestamptz not null default now(),
  atualizado timestamptz not null default now()
);

create table if not exists public.membros (
  pescaria_id uuid not null references public.pescarias(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  entrou timestamptz not null default now(),
  primary key (pescaria_id, user_id)
);
create index if not exists membros_user on public.membros(user_id);

alter table public.pescarias enable row level security;
alter table public.membros enable row level security;

-- Leitura: só membros. Escrita: só pelas funções abaixo (não há política de insert/update/delete).
drop policy if exists "membro le pescaria" on public.pescarias;
create policy "membro le pescaria" on public.pescarias for select to authenticated
  using (exists (select 1 from public.membros m where m.pescaria_id = pescarias.id and m.user_id = auth.uid()));
drop policy if exists "ve proprias entradas" on public.membros;
create policy "ve proprias entradas" on public.membros for select to authenticated
  using (user_id = auth.uid());

revoke all on public.pescarias, public.membros from anon;

create or replace function public.criar_pescaria(p_dados jsonb)
returns table(id uuid, convite text) language plpgsql security definer set search_path = public as $$
declare r public.pescarias;
begin
  if auth.uid() is null then raise exception 'precisa entrar'; end if;
  if pg_column_size(p_dados) > 200000 then raise exception 'dados grandes demais'; end if;
  if (select count(*) from public.pescarias where dono = auth.uid() and criado > now() - interval '1 day') >= 30 then
    raise exception 'limite diario';
  end if;
  insert into public.pescarias(dono, dados) values (auth.uid(), p_dados) returning * into r;
  insert into public.membros(pescaria_id, user_id) values (r.id, auth.uid());
  return query select r.id, r.convite;
end $$;

-- Salva só se ninguém salvou antes (versão igual). Devolve a nova versão, ou -1 se precisa recarregar.
create or replace function public.salvar_pescaria(p_id uuid, p_dados jsonb, p_versao int)
returns int language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if not exists (select 1 from public.membros where pescaria_id = p_id and user_id = auth.uid()) then
    raise exception 'sem acesso';
  end if;
  if pg_column_size(p_dados) > 200000 then raise exception 'dados grandes demais'; end if;
  update public.pescarias set dados = p_dados, versao = versao + 1, atualizado = now()
   where id = p_id and versao = p_versao returning versao into v;
  return coalesce(v, -1);
end $$;

create or replace function public.entrar_pescaria(p_convite text)
returns uuid language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  if auth.uid() is null then raise exception 'precisa entrar'; end if;
  select id into pid from public.pescarias where convite = p_convite;
  if pid is null then return null; end if;
  insert into public.membros(pescaria_id, user_id) values (pid, auth.uid()) on conflict do nothing;
  return pid;
end $$;

-- Dono apaga para todos; os outros só saem da pescaria.
create or replace function public.apagar_pescaria(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.pescarias where id = p_id and dono = auth.uid()) then
    delete from public.pescarias where id = p_id;
  else
    delete from public.membros where pescaria_id = p_id and user_id = auth.uid();
  end if;
end $$;

-- LGPD: a pessoa apaga a própria conta (e as pescarias que criou).
create or replace function public.apagar_minha_conta()
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'precisa entrar'; end if;
  delete from auth.users where id = auth.uid();
end $$;

revoke all on function public.criar_pescaria(jsonb), public.salvar_pescaria(uuid, jsonb, int),
  public.entrar_pescaria(text), public.apagar_pescaria(uuid), public.apagar_minha_conta() from public, anon;
grant execute on function public.criar_pescaria(jsonb), public.salvar_pescaria(uuid, jsonb, int),
  public.entrar_pescaria(text), public.apagar_pescaria(uuid), public.apagar_minha_conta() to authenticated;
