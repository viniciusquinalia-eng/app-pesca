-- Correção 26/11: listar as pescarias por função (não depende das permissões da tabela).
-- Rodar uma vez em: SQL Editor > New query > colar tudo > Run.
create or replace function public.minhas_pescarias(p_id uuid default null)
returns table(id uuid, dados jsonb, versao int, convite text)
language sql stable security definer set search_path = public as $$
  select p.id, p.dados, p.versao, p.convite
    from public.pescarias p
    join public.membros m on m.pescaria_id = p.id and m.user_id = auth.uid()
   where p_id is null or p.id = p_id
   order by p.criado desc
$$;
revoke all on function public.minhas_pescarias(uuid) from public, anon;
grant execute on function public.minhas_pescarias(uuid) to authenticated;
grant select on public.pescarias, public.membros to authenticated;
