-- Anúncios de donos de rancho, pousada, piloteiro e pesqueiro (Fase 2).
-- Rodar uma vez em: SQL Editor > New query > colar tudo > Run.
-- Regra: o anúncio só aparece no app depois que um administrador aprova.

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table if not exists public.anuncios (
  id uuid primary key default gen_random_uuid(),
  dono uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pendente' check (status in ('pendente','aprovado','recusado')),
  motivo text,
  dados jsonb not null,
  criado timestamptz not null default now(),
  atualizado timestamptz not null default now()
);
create index if not exists anuncios_status on public.anuncios(status);
create index if not exists anuncios_dono on public.anuncios(dono);

alter table public.admins enable row level security;
alter table public.anuncios enable row level security;
revoke all on public.admins, public.anuncios from anon, authenticated;

create or replace function public.sou_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
$$;

-- Envia um anúncio novo, ou muda um seu (volta para "esperando aprovação").
create or replace function public.enviar_anuncio(p_dados jsonb, p_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare r uuid;
begin
  if auth.uid() is null then raise exception 'precisa entrar'; end if;
  if pg_column_size(p_dados) > 20000 then raise exception 'anuncio grande demais'; end if;
  if p_id is null then
    if (select count(*) from public.anuncios where dono = auth.uid() and criado > now() - interval '1 day') >= 5 then
      raise exception 'limite diario';
    end if;
    insert into public.anuncios(dono, dados) values (auth.uid(), p_dados) returning id into r;
  else
    update public.anuncios set dados = p_dados, status = 'pendente', motivo = null, atualizado = now()
     where id = p_id and dono = auth.uid() returning id into r;
  end if;
  return r;
end $$;

create or replace function public.meus_anuncios()
returns table(id uuid, status text, motivo text, dados jsonb)
language sql stable security definer set search_path = public as $$
  select id, status, motivo, dados from public.anuncios where dono = auth.uid() order by criado desc
$$;

-- O que todo mundo vê no Explorar: só aprovados.
create or replace function public.anuncios_publicos()
returns table(id uuid, dados jsonb)
language sql stable security definer set search_path = public as $$
  select id, dados from public.anuncios where status = 'aprovado' order by atualizado desc limit 500
$$;

-- Só administradores: fila de aprovação.
create or replace function public.anuncios_para_aprovar()
returns table(id uuid, status text, dados jsonb, criado timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.sou_admin() then raise exception 'sem acesso'; end if;
  return query select a.id, a.status, a.dados, a.criado from public.anuncios a
    where a.status = 'pendente' order by a.criado;
end $$;

create or replace function public.moderar_anuncio(p_id uuid, p_status text, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_admin() then raise exception 'sem acesso'; end if;
  if p_status not in ('aprovado','recusado','pendente') then raise exception 'status invalido'; end if;
  update public.anuncios set status = p_status, motivo = p_motivo, atualizado = now() where id = p_id;
end $$;

create or replace function public.apagar_anuncio(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.anuncios where id = p_id and (dono = auth.uid() or public.sou_admin());
end $$;

revoke all on function public.sou_admin(), public.enviar_anuncio(jsonb, uuid), public.meus_anuncios(),
  public.anuncios_publicos(), public.anuncios_para_aprovar(), public.moderar_anuncio(uuid, text, text),
  public.apagar_anuncio(uuid) from public, anon;
grant execute on function public.sou_admin(), public.enviar_anuncio(jsonb, uuid), public.meus_anuncios(),
  public.anuncios_publicos(), public.anuncios_para_aprovar(), public.moderar_anuncio(uuid, text, text),
  public.apagar_anuncio(uuid) to authenticated;

-- Para virar administrador, rode separado (troque pelo seu e-mail):
-- insert into public.admins(user_id) select id from auth.users where email = 'SEU-EMAIL' on conflict do nothing;
