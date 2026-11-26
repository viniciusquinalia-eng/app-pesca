-- Novidades: barco no anúncio, agenda de dias ocupados, promoção da semana e aviso de anúncio novo.
-- Rodar DEPOIS do 006_seguranca.sql. Pode rodar de novo sem problema.
-- SQL Editor > New query > colar tudo > Run.

-- ---------- 1. anúncio passa a guardar "tem barco" (e mudar o anúncio não apaga a agenda) ----------
create or replace function public.enviar_anuncio(p_dados jsonb, p_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare r uuid; d jsonb; fotos jsonb; f text;
begin
  if auth.uid() is null then raise exception 'precisa entrar'; end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' or pg_column_size(p_dados) > 20000 then
    raise exception 'anuncio grande demais';
  end if;
  fotos := public.lista_txt(p_dados->'fotos', 5, 200);
  for f in select jsonb_array_elements_text(fotos) loop
    if not public.foto_minha(f) then raise exception 'foto invalida'; end if;
  end loop;
  d := jsonb_build_object(
    'cat',    case when p_dados->>'cat' in ('Rancho','Pousada','Piloteiro','Pesqueiro') then p_dados->>'cat' else 'Rancho' end,
    'nome',   left(btrim(coalesce(p_dados->>'nome', '')), 60),
    'reg',    left(btrim(coalesce(p_dados->>'reg', '')), 60),
    'local',  left(btrim(coalesce(p_dados->>'local', '')), 60),
    'agua',   left(btrim(coalesce(p_dados->>'agua', '')), 20),
    'preco',  left(btrim(coalesce(p_dados->>'preco', '')), 30),
    'un',     left(btrim(coalesce(p_dados->>'un', '')), 20),
    'sub',    left(btrim(coalesce(p_dados->>'sub', '')), 90),
    'feat',   public.lista_txt(p_dados->'feat', 3, 40),
    'peixes', left(btrim(coalesce(p_dados->>'peixes', '')), 80),
    'txt',    left(btrim(coalesce(p_dados->>'txt', '')), 400),
    'pil',    coalesce(p_dados->'pil' = 'true'::jsonb, false),
    'barco',  coalesce(p_dados->'barco' = 'true'::jsonb, false),
    'wa',     left(regexp_replace(coalesce(p_dados->>'wa', ''), '[^0-9()+ -]', '', 'g'), 20),
    'pontos', public.lista_txt(p_dados->'pontos', 8, 80),
    'fotos',  fotos);
  if d->>'nome' = '' or d->>'local' = '' then raise exception 'falta nome ou cidade'; end if;
  if length(regexp_replace(d->>'wa', '[^0-9]', '', 'g')) not between 10 and 13 then raise exception 'whatsapp invalido'; end if;
  if public.tem_coordenada(concat_ws(' ', d->>'nome', d->>'reg', d->>'local', d->>'preco', d->>'sub', d->>'peixes',
                                     d->>'txt', d->>'feat', d->>'pontos')) then
    raise exception 'sem coordenadas';
  end if;
  if p_id is null then
    if (select count(*) from public.anuncios where dono = auth.uid() and criado > now() - interval '1 day') >= 5 then
      raise exception 'limite diario';
    end if;
    insert into public.anuncios(dono, dados) values (auth.uid(), d) returning id into r;
  else
    update public.anuncios set dados = d || jsonb_build_object('ocupados', coalesce(dados->'ocupados', '[]'::jsonb)),
           status = 'pendente', motivo = null, atualizado = now()
     where id = p_id and dono = auth.uid() returning id into r;
  end if;
  return r;
end $$;

-- ---------- 2. agenda: o dono marca os dias ocupados, sem precisar de nova aprovação ----------
create or replace function public.salvar_agenda(p_id uuid, p_dias jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare dias jsonb;
begin
  if auth.uid() is null then raise exception 'precisa entrar'; end if;
  if p_dias is null or jsonb_typeof(p_dias) <> 'array' or jsonb_array_length(p_dias) > 400 then raise exception 'agenda invalida'; end if;
  select coalesce(jsonb_agg(distinct x order by x), '[]'::jsonb) into dias
    from jsonb_array_elements_text(p_dias) x
   where x ~ '^\d{4}-\d{2}-\d{2}$' and x::date between current_date - 1 and current_date + 400;
  update public.anuncios set dados = jsonb_set(dados, '{ocupados}', dias)
   where id = p_id and dono = auth.uid();
  if not found then raise exception 'sem acesso'; end if;
end $$;

-- ---------- 3. promoção da semana (o administrador escolhe) ----------
create table if not exists public.config (
  chave text primary key,
  valor jsonb not null,
  atualizado timestamptz not null default now()
);
alter table public.config enable row level security;
revoke all on public.config from anon, authenticated;

create or replace function public.definir_promo(p_lugar text, p_txt text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_admin() then raise exception 'sem acesso'; end if;
  if coalesce(p_lugar, '') = '' then delete from public.config where chave = 'promo'; return; end if;
  if length(p_lugar) > 60 or public.tem_coordenada(coalesce(p_txt, '')) then raise exception 'promo invalida'; end if;
  insert into public.config(chave, valor) values ('promo',
    jsonb_build_object('lugar', p_lugar, 'txt', left(btrim(coalesce(p_txt, '')), 90), 'ate', (now() + interval '7 days')))
  on conflict (chave) do update set valor = excluded.valor, atualizado = now();
end $$;

create or replace function public.ver_promo()
returns jsonb language sql stable security definer set search_path = public as $$
  select valor from public.config where chave = 'promo' and (valor->>'ate')::timestamptz > now()
$$;

-- ---------- 4. aviso para o administrador: quantos anúncios esperam aprovação ----------
create or replace function public.contar_pendentes()
returns int language sql stable security definer set search_path = public as $$
  select case when public.sou_admin() then (select count(*)::int from public.anuncios where status = 'pendente') else 0 end
$$;

revoke all on function public.salvar_agenda(uuid, jsonb), public.definir_promo(text, text), public.ver_promo(),
  public.contar_pendentes() from public, anon;
grant execute on function public.salvar_agenda(uuid, jsonb), public.definir_promo(text, text), public.ver_promo(),
  public.contar_pendentes() to authenticated;
