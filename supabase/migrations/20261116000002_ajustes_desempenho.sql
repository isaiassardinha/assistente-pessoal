-- Ajustes de desempenho apontados pelo verificador do Supabase.
-- Não muda nenhuma regra de acesso.

-- Índices para as ligações entre tabelas (consultas e exclusões mais rápidas)
create index alertas_orcamento_categoria on public.alertas_orcamento (categoria_id);

drop index public.decisao_pontos_decisao;
create index decisao_pontos_decisao_usuario on public.decisao_pontos (decisao_id, usuario_id);

drop index public.despesas_categoria;
create index despesas_categoria_usuario on public.despesas (categoria_id, usuario_id);
create index despesas_fixa_usuario on public.despesas (despesa_fixa_id, usuario_id);

create index despesas_fixas_categoria_usuario on public.despesas_fixas (categoria_id, usuario_id);
create index orcamentos_categoria_usuario on public.orcamentos (categoria_id, usuario_id);

-- Perfis: as duas regras de leitura viram uma só (mesmo efeito, mais rápida)
drop policy perfis_ver_o_proprio on public.perfis;
drop policy perfis_admin_ve_todos on public.perfis;
create policy perfis_ver on public.perfis
  for select to authenticated
  using (id = (select auth.uid()) or (select privado.eh_admin_com_2fa()));
