-- Diário de pesca com fotos e avaliações dos lugares (nota e comentário).
-- Rodar uma vez em: SQL Editor > New query > colar tudo > Run.
-- "lugar" é o código do anúncio no app (ex.: 'a1' nos exemplos, 'u_<id>' nos anúncios reais).

-- ---------- diário ----------
create table if not exists public.diario (
  id uuid primary key default gen_random_uuid(),
  autor uuid not null references auth.users(id) on delete cascade,
  autor_nome text not null default '',
  lugar text not null default '',
  lugar_nome text not null default '',
  dados jsonb not null,
  publico boolean not null default true,
  oculto boolean not null default false,
  criado timestamptz not null default now()
);
create index if not exists diario_autor on public.diario(autor);
create index if not exists diario_lugar on public.diario(lugar);
alter table public.diario enable row level security;
revoke all on public.diario from anon, authenticated;

create or replace function public.salvar_diario(p_dados jsonb, p_lugar text, p_lugar_nome text, p_publico boolean, p_nome text, p_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare r uuid;
begin
  if auth.uid() is null then raise exception 'precisa entrar'; end if;
  if pg_column_size(p_dados) > 8000 then raise exception 'grande demais'; end if;
  if p_id is null then
    if (select count(*) from public.diario where autor = auth.uid() and criado > now() - interval '1 day') >= 30 then
      raise exception 'limite diario';
    end if;
    insert into public.diario(autor, autor_nome, lugar, lugar_nome, dados, publico)
      values (auth.uid(), left(coalesce(p_nome,''),40), left(coalesce(p_lugar,''),60), left(coalesce(p_lugar_nome,''),100), p_dados, coalesce(p_publico,true))
      returning id into r;
  else
    update public.diario set dados = p_dados, lugar = left(coalesce(p_lugar,''),60), lugar_nome = left(coalesce(p_lugar_nome,''),100),
      publico = coalesce(p_publico,true), autor_nome = left(coalesce(p_nome,''),40)
     where id = p_id and autor = auth.uid() returning id into r;
  end if;
  return r;
end $$;

create or replace function public.meu_diario()
returns table(id uuid, lugar text, lugar_nome text, dados jsonb, publico boolean, criado timestamptz)
language sql stable security definer set search_path = public as $$
  select id, lugar, lugar_nome, dados, publico, criado from public.diario where autor = auth.uid() order by criado desc limit 500
$$;

-- O que aparece no anúncio: só registros públicos e não escondidos.
create or replace function public.diario_do_lugar(p_lugar text)
returns table(id uuid, autor_nome text, dados jsonb, criado timestamptz)
language sql stable security definer set search_path = public as $$
  select id, autor_nome, dados, criado from public.diario
   where lugar = p_lugar and publico and not oculto order by criado desc limit 60
$$;

create or replace function public.apagar_diario(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.diario where id = p_id and (autor = auth.uid() or public.sou_admin());
end $$;

-- ---------- fotos do diário (até 1 MB cada; o app já reduz para ~200 KB e tira a localização) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('diario', 'diario', true, 1048576, array['image/jpeg'])
on conflict (id) do nothing;
drop policy if exists "diario envia foto" on storage.objects;
drop policy if exists "diario apaga foto" on storage.objects;
create policy "diario envia foto" on storage.objects for insert to authenticated
  with check (bucket_id = 'diario' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "diario apaga foto" on storage.objects for delete to authenticated
  using (bucket_id = 'diario' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- avaliações ----------
create table if not exists public.avaliacoes (
  id uuid primary key default gen_random_uuid(),
  autor uuid not null references auth.users(id) on delete cascade,
  autor_nome text not null default '',
  lugar text not null,
  nota int not null check (nota between 1 and 5),
  notas jsonb not null default '{}'::jsonb,
  comentario text not null default '',
  resposta text,
  oculto boolean not null default false,
  criado timestamptz not null default now(),
  atualizado timestamptz not null default now(),
  unique (autor, lugar)
);
create index if not exists avaliacoes_lugar on public.avaliacoes(lugar);
alter table public.avaliacoes enable row level security;
revoke all on public.avaliacoes from anon, authenticated;

-- Só avalia quem tem uma pescaria ligada a esse lugar (usou o anúncio na pescaria).
create or replace function public.avaliar(p_lugar text, p_nota int, p_notas jsonb, p_comentario text, p_nome text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'precisa entrar'; end if;
  if not exists (
    select 1 from public.pescarias p join public.membros m on m.pescaria_id = p.id
     where m.user_id = auth.uid() and coalesce(p.dados->'anuncios','[]'::jsonb) ? p_lugar
  ) then raise exception 'so quem pescou'; end if;
  insert into public.avaliacoes(autor, autor_nome, lugar, nota, notas, comentario)
    values (auth.uid(), left(coalesce(p_nome,''),40), p_lugar, p_nota, coalesce(p_notas,'{}'::jsonb), left(coalesce(p_comentario,''),600))
  on conflict (autor, lugar) do update set nota = excluded.nota, notas = excluded.notas,
    comentario = excluded.comentario, autor_nome = excluded.autor_nome, atualizado = now();
end $$;

create or replace function public.avaliacoes_do_lugar(p_lugar text)
returns table(id uuid, autor_nome text, nota int, notas jsonb, comentario text, resposta text, criado timestamptz, minha boolean)
language sql stable security definer set search_path = public as $$
  select id, autor_nome, nota, notas, comentario, resposta, atualizado, autor = auth.uid()
    from public.avaliacoes where lugar = p_lugar and not oculto order by atualizado desc limit 100
$$;

-- O dono do anúncio responde a avaliação do seu anúncio.
create or replace function public.responder_avaliacao(p_id uuid, p_resposta text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.avaliacoes v set resposta = nullif(left(coalesce(p_resposta,''),600),'')
   where v.id = p_id and exists (select 1 from public.anuncios a where 'u_' || a.id::text = v.lugar and a.dono = auth.uid());
end $$;

create or replace function public.apagar_avaliacao(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.avaliacoes where id = p_id and (autor = auth.uid() or public.sou_admin());
end $$;

revoke all on function public.salvar_diario(jsonb, text, text, boolean, text, uuid), public.meu_diario(),
  public.diario_do_lugar(text), public.apagar_diario(uuid), public.avaliar(text, int, jsonb, text, text),
  public.avaliacoes_do_lugar(text), public.responder_avaliacao(uuid, text), public.apagar_avaliacao(uuid) from public, anon;
grant execute on function public.salvar_diario(jsonb, text, text, boolean, text, uuid), public.meu_diario(),
  public.diario_do_lugar(text), public.apagar_diario(uuid), public.avaliar(text, int, jsonb, text, text),
  public.avaliacoes_do_lugar(text), public.responder_avaliacao(uuid, text), public.apagar_avaliacao(uuid) to authenticated;
