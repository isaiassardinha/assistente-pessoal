-- Resumo do consumo da IA agrupado por dia, pessoa e tipo (para as telas).
-- Roda com as permissões de quem chama: cada pessoa vê só o dela; o
-- administrador com 2FA vê o de todos (mesma regra da tabela).
create function public.resumo_uso_ia(p_de date, p_ate date)
returns table (dia date, usuario_id uuid, tipo text, chamadas bigint, tokens_entrada bigint, tokens_saida bigint, custo_usd numeric)
language sql stable security invoker set search_path = '' as $$
  select u.dia, u.usuario_id, u.tipo, sum(u.chamadas)::bigint, sum(u.tokens_entrada)::bigint, sum(u.tokens_saida)::bigint, sum(u.custo_usd)
    from public.uso_ia u
   where u.dia between p_de and p_ate
   group by u.dia, u.usuario_id, u.tipo
   order by u.dia
$$;
revoke all on function public.resumo_uso_ia(date, date) from public, anon;
grant execute on function public.resumo_uso_ia(date, date) to authenticated, service_role;
