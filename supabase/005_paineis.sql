-- Painéis: administrador (números do app e moderação) e dono do anúncio (visitas, cliques, notas).
-- Rodar DEPOIS do 004_diario_avaliacoes.sql. Pode rodar de novo sem problema.
-- SQL Editor > New query > colar tudo > Run.

-- ---------- eventos: visita no anúncio e clique no WhatsApp ----------
create table if not exists public.eventos (
  id bigint generated always as identity primary key,
  lugar text not null,
  tipo text not null check (tipo in ('visita','whatsapp')),
  quem uuid references auth.users(id) on delete set null,
  criado timestamptz not null default now()
);
create index if not exists eventos_lugar on public.eventos(lugar, criado);
alter table public.eventos enable row level security;
revoke all on public.eventos from anon, authenticated;

-- Conta no máximo 1 visita por pessoa, por anúncio, por hora (para ninguém inflar o número).
create or replace function public.registrar_evento(p_lugar text, p_tipo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_tipo not in ('visita','whatsapp') or length(coalesce(p_lugar,'')) > 60 then return; end if;
  if exists (select 1 from public.eventos where quem = auth.uid() and lugar = p_lugar and tipo = p_tipo
             and criado > now() - interval '1 hour') then return; end if;
  insert into public.eventos(lugar, tipo, quem) values (p_lugar, p_tipo, auth.uid());
end $$;

-- ---------- moderação ----------
create or replace function public.ocultar_avaliacao(p_id uuid, p_oculto boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_admin() then raise exception 'sem acesso'; end if;
  update public.avaliacoes set oculto = p_oculto where id = p_id;
end $$;

create or replace function public.ocultar_diario(p_id uuid, p_oculto boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_admin() then raise exception 'sem acesso'; end if;
  update public.diario set oculto = p_oculto where id = p_id;
end $$;

-- ---------- painel do administrador ----------
create or replace function public.painel_admin()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.sou_admin() then raise exception 'sem acesso'; end if;
  select jsonb_build_object(
    'usuarios', (select count(*) from auth.users),
    'novos7', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'novos30', (select count(*) from auth.users where created_at > now() - interval '30 days'),
    'ativos7', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'semanas', (select coalesce(jsonb_agg(jsonb_build_object('s', s::date, 'n', n) order by s), '[]'::jsonb) from (
        select g.s, (select count(*) from auth.users u where u.created_at >= g.s and u.created_at < g.s + interval '7 days') n
          from generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '7 days') g(s)) x),
    'pescarias', (select count(*) from public.pescarias),
    'pescarias30', (select count(*) from public.pescarias where criado > now() - interval '30 days'),
    'pescadores', (select count(distinct user_id) from public.membros),
    'dividido', (select coalesce(sum((g->>'valor')::numeric), 0) from public.pescarias p,
                  jsonb_array_elements(coalesce(p.dados->'gastos', '[]'::jsonb)) g where (g->>'valor') ~ '^[0-9.]+$'),
    'anuncios', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (select status, count(*) n from public.anuncios group by status) x),
    'diario', (select count(*) from public.diario),
    'fotos', (select count(*) from public.diario where dados ? 'foto'),
    'avaliacoes', (select count(*) from public.avaliacoes),
    'nota_media', (select round(avg(nota)::numeric, 1) from public.avaliacoes where not oculto),
    'visitas30', (select count(*) from public.eventos where tipo = 'visita' and criado > now() - interval '30 days'),
    'whats30', (select count(*) from public.eventos where tipo = 'whatsapp' and criado > now() - interval '30 days'),
    'mais_vistos', (select coalesce(jsonb_agg(jsonb_build_object('lugar', lugar, 'n', n) order by n desc), '[]'::jsonb) from (
        select lugar, count(*) n from public.eventos where tipo = 'visita' and criado > now() - interval '30 days'
         group by lugar order by n desc limit 5) x),
    'mais_bem_avaliados', (select coalesce(jsonb_agg(jsonb_build_object('lugar', lugar, 'm', m, 'n', n) order by m desc, n desc), '[]'::jsonb) from (
        select lugar, round(avg(nota)::numeric, 1) m, count(*) n from public.avaliacoes where not oculto
         group by lugar order by m desc, n desc limit 5) x),
    'ult_avaliacoes', (select coalesce(jsonb_agg(x order by x.criado desc), '[]'::jsonb) from (
        select id, lugar, autor_nome, nota, comentario, oculto, atualizado criado from public.avaliacoes order by atualizado desc limit 20) x),
    'ult_diario', (select coalesce(jsonb_agg(x order by x.criado desc), '[]'::jsonb) from (
        select id, lugar, lugar_nome, autor_nome, dados, oculto, criado from public.diario where publico order by criado desc limit 12) x)
  ) into r;
  return r;
end $$;

-- ---------- painel do dono do anúncio ----------
create or replace function public.painel_dono()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'lugar', 'u_' || a.id::text, 'nome', a.dados->>'nome', 'status', a.status,
    'visitas30', (select count(*) from public.eventos e where e.lugar = 'u_' || a.id::text and e.tipo = 'visita' and e.criado > now() - interval '30 days'),
    'whats30', (select count(*) from public.eventos e where e.lugar = 'u_' || a.id::text and e.tipo = 'whatsapp' and e.criado > now() - interval '30 days'),
    'dias', (select coalesce(jsonb_agg(n order by d), '[]'::jsonb) from (
        select g.d, (select count(*) from public.eventos e where e.lugar = 'u_' || a.id::text and e.tipo = 'visita'
                      and e.criado >= g.d and e.criado < g.d + interval '1 day') n
          from generate_series(current_date - 13, current_date, interval '1 day') g(d)) x),
    'nota', (select round(avg(nota)::numeric, 1) from public.avaliacoes v where v.lugar = 'u_' || a.id::text and not v.oculto),
    'n_aval', (select count(*) from public.avaliacoes v where v.lugar = 'u_' || a.id::text and not v.oculto),
    'n_diario', (select count(*) from public.diario d where d.lugar = 'u_' || a.id::text and d.publico and not d.oculto)
  ) order by a.criado desc), '[]'::jsonb)
  from public.anuncios a where a.dono = auth.uid()
$$;

revoke all on function public.registrar_evento(text, text), public.ocultar_avaliacao(uuid, boolean),
  public.ocultar_diario(uuid, boolean), public.painel_admin(), public.painel_dono() from public, anon;
grant execute on function public.registrar_evento(text, text), public.ocultar_avaliacao(uuid, boolean),
  public.ocultar_diario(uuid, boolean), public.painel_admin(), public.painel_dono() to authenticated;
