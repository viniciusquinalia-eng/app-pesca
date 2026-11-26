-- Reforço de segurança (revisão de 26/11/2026).
-- Rodar DEPOIS do 003, 004 e 005. Pode rodar de novo sem problema.
-- SQL Editor > New query > colar tudo > Run.
--
-- O que muda:
-- 1. O banco passa a conferir os anúncios e o diário campo por campo (tamanho, tipo, fotos só da própria pasta)
--    e recusa texto com coordenada ou link de mapa, para nunca expor o lugar exato de um ponto de pesca.
-- 2. Ninguém avalia o próprio anúncio, e as notas por item só aceitam 1 a 5.
-- 3. Fotos: só .jpg, só na própria pasta, no máximo 40 por dia por pessoa; a pessoa pode apagar as próprias fotos.
-- 4. Tira das tabelas a permissão de gravar direto (tudo já passa pelas funções).

-- ---------- 4. nada de gravar direto nas tabelas ----------
revoke insert, update, delete, truncate on public.pescarias, public.membros from anon, authenticated;
revoke all on public.admins, public.anuncios, public.diario, public.avaliacoes, public.eventos from anon, authenticated;

-- ---------- ajudantes ----------
-- Coordenada (ex.: -22.4912 ou 22°29'), ou link de mapa.
create or replace function public.tem_coordenada(t text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(t, '') ~ '-?[0-9]{1,3}[.,][0-9]{4,}'
      or coalesce(t, '') ~ '[0-9]{1,3} ?°'
      or coalesce(t, '') ~* '(maps\.app\.goo\.gl|goo\.gl/maps|google\.[a-z.]+/maps|maps\.google|waze\.com|plus\.codes)'
$$;

-- Lista de textos: no máximo n itens, cada um com no máximo tam letras, sem itens vazios.
create or replace function public.lista_txt(j jsonb, n int, tam int)
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(left(btrim(t.x), tam) order by t.i), '[]'::jsonb)
    from jsonb_array_elements_text(case when jsonb_typeof(j) = 'array' then j else '[]'::jsonb end) with ordinality t(x, i)
   where t.i <= n and btrim(t.x) <> ''
$$;

-- Foto do próprio usuário: "<id do usuário>/<nome>.jpg", sem pastas no meio.
create or replace function public.foto_minha(f text)
returns boolean language sql stable set search_path = '' as $$
  select f is not null and auth.uid() is not null
     and f ~ ('^' || auth.uid()::text || '/[A-Za-z0-9._-]{1,120}\.jpg$') and f !~ '\.\.'
$$;

revoke all on function public.tem_coordenada(text), public.lista_txt(jsonb, int, int), public.foto_minha(text) from public, anon;
grant execute on function public.tem_coordenada(text), public.lista_txt(jsonb, int, int), public.foto_minha(text) to authenticated;

-- ---------- 1a. anúncio conferido campo por campo ----------
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
    update public.anuncios set dados = d, status = 'pendente', motivo = null, atualizado = now()
     where id = p_id and dono = auth.uid() returning id into r;
  end if;
  return r;
end $$;

-- ---------- 1b. diário conferido campo por campo ----------
create or replace function public.salvar_diario(p_dados jsonb, p_lugar text, p_lugar_nome text, p_publico boolean, p_nome text, p_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare r uuid; d jsonb; peso numeric; dt text;
begin
  if auth.uid() is null then raise exception 'precisa entrar'; end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' or pg_column_size(p_dados) > 8000 then raise exception 'grande demais'; end if;
  if jsonb_typeof(p_dados->'peso') = 'number' then peso := (p_dados->>'peso')::numeric; else peso := 0; end if;
  if peso < 0 or peso > 200 then peso := 0; end if;
  dt := coalesce(p_dados->>'data', '');
  if dt !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then dt := to_char(current_date, 'YYYY-MM-DD'); end if;
  d := jsonb_build_object(
    'especie', left(btrim(coalesce(p_dados->>'especie', '')), 40),
    'peso',    round(peso, 2),
    'isca',    left(btrim(coalesce(p_dados->>'isca', '')), 60),
    'data',    dt,
    'ponto',   left(btrim(coalesce(p_dados->>'ponto', '')), 60),
    'obs',     left(btrim(coalesce(p_dados->>'obs', '')), 300));
  if p_dados ? 'foto' and coalesce(p_dados->>'foto', '') <> '' then
    if not public.foto_minha(p_dados->>'foto') then raise exception 'foto invalida'; end if;
    d := d || jsonb_build_object('foto', p_dados->>'foto');
  end if;
  if public.tem_coordenada(concat_ws(' ', d->>'especie', d->>'isca', d->>'ponto', d->>'obs', p_lugar_nome)) then
    raise exception 'sem coordenadas';
  end if;
  if p_id is null then
    if (select count(*) from public.diario where autor = auth.uid() and criado > now() - interval '1 day') >= 30 then
      raise exception 'limite diario';
    end if;
    insert into public.diario(autor, autor_nome, lugar, lugar_nome, dados, publico)
      values (auth.uid(), left(coalesce(p_nome,''),40), left(coalesce(p_lugar,''),60), left(coalesce(p_lugar_nome,''),100), d, coalesce(p_publico,true))
      returning id into r;
  else
    update public.diario set dados = d, lugar = left(coalesce(p_lugar,''),60), lugar_nome = left(coalesce(p_lugar_nome,''),100),
      publico = coalesce(p_publico,true), autor_nome = left(coalesce(p_nome,''),40)
     where id = p_id and autor = auth.uid() returning id into r;
  end if;
  return r;
end $$;

-- ---------- 2. avaliação: notas de 1 a 5 e ninguém avalia o próprio anúncio ----------
create or replace function public.avaliar(p_lugar text, p_nota int, p_notas jsonb, p_comentario text, p_nome text)
returns void language plpgsql security definer set search_path = public as $$
declare n jsonb := '{}'::jsonb; k text;
begin
  if auth.uid() is null then raise exception 'precisa entrar'; end if;
  if p_nota is null or p_nota not between 1 and 5 then raise exception 'nota invalida'; end if;
  if length(coalesce(p_lugar, '')) > 60 then raise exception 'lugar invalido'; end if;
  if exists (select 1 from public.anuncios a where 'u_' || a.id::text = p_lugar and a.dono = auth.uid()) then
    raise exception 'nao avalia o proprio anuncio';
  end if;
  if not exists (
    select 1 from public.pescarias p join public.membros m on m.pescaria_id = p.id
     where m.user_id = auth.uid() and coalesce(p.dados->'anuncios','[]'::jsonb) ? p_lugar
  ) then raise exception 'so quem pescou'; end if;
  foreach k in array array['peixe','estrutura','atendimento','preco'] loop
    if jsonb_typeof(p_notas->k) = 'number' and (p_notas->>k)::numeric in (1,2,3,4,5) then
      n := n || jsonb_build_object(k, (p_notas->>k)::int);
    end if;
  end loop;
  insert into public.avaliacoes(autor, autor_nome, lugar, nota, notas, comentario)
    values (auth.uid(), left(coalesce(p_nome,''),40), p_lugar, p_nota, n, left(coalesce(p_comentario,''),600))
  on conflict (autor, lugar) do update set nota = excluded.nota, notas = excluded.notas,
    comentario = excluded.comentario, autor_nome = excluded.autor_nome, atualizado = now();
end $$;

-- As permissões das três funções acima continuam só para quem entrou.
revoke all on function public.enviar_anuncio(jsonb, uuid), public.salvar_diario(jsonb, text, text, boolean, text, uuid),
  public.avaliar(text, int, jsonb, text, text) from public, anon;
grant execute on function public.enviar_anuncio(jsonb, uuid), public.salvar_diario(jsonb, text, text, boolean, text, uuid),
  public.avaliar(text, int, jsonb, text, text) to authenticated;

-- ---------- 3. fotos ----------
update storage.buckets set public = true, file_size_limit = 1048576, allowed_mime_types = array['image/jpeg']
 where id = 'diario';

drop policy if exists "diario envia foto" on storage.objects;
drop policy if exists "diario ve propria foto" on storage.objects;
drop policy if exists "diario apaga foto" on storage.objects;

-- Ver a lista só das próprias fotos (necessário para apagar). A foto em si continua aberta pelo link.
create policy "diario ve propria foto" on storage.objects for select to authenticated
  using (bucket_id = 'diario' and (storage.foldername(name))[1] = auth.uid()::text);

-- Enviar: só .jpg, só na própria pasta (sem subpastas) e no máximo 40 fotos por dia.
create policy "diario envia foto" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'diario'
    and (storage.foldername(name))[1] = auth.uid()::text
    and array_length(storage.foldername(name), 1) = 1
    and lower(storage.extension(name)) = 'jpg'
    and (select count(*) from storage.objects o
          where o.bucket_id = 'diario'
            and (storage.foldername(o.name))[1] = auth.uid()::text
            and o.created_at > now() - interval '1 day') < 40
  );

create policy "diario apaga foto" on storage.objects for delete to authenticated
  using (bucket_id = 'diario' and (storage.foldername(name))[1] = auth.uid()::text);
