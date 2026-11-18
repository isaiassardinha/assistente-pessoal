-- Etapa 5 (robô do WhatsApp): controle dos avisos automáticos.

alter table public.perfis
  add column aviso_admin_em timestamptz,   -- quando o admin foi avisado deste cadastro novo
  add column boas_vindas_em timestamptz;   -- quando a mensagem de boas-vindas foi enviada

create index perfis_celular on public.perfis (celular);

-- Cadastros novos (e-mail já confirmado) que o administrador ainda não recebeu
-- aviso. Precisa ler auth.users, por isso roda com permissão do dono; só o
-- servidor (service_role) pode chamar.
create function public.cadastros_para_avisar()
returns table (id uuid, nome text, email text, celular text, criado_em timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.nome, p.email, p.celular, p.criado_em
    from public.perfis p
    join auth.users u on u.id = p.id
   where p.status = 'pendente'
     and p.aviso_admin_em is null
     and u.email_confirmed_at is not null
   order by p.criado_em;
$$;
revoke all on function public.cadastros_para_avisar() from public, anon, authenticated;
grant execute on function public.cadastros_para_avisar() to service_role;
