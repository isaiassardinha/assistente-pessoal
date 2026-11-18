-- Ajustes do Cérebro:
--   * o site escolhe o id do documento ao enviar (faltava a permissão);
--   * guarda o motivo técnico quando a leitura falha (para diagnóstico);
--   * a pessoa pode pedir "tentar ler de novo" um documento que deu erro.

grant insert (id) on public.documentos to authenticated;

alter table public.documentos
  add column erro_detalhe text check (char_length(erro_detalhe) <= 500);

create function public.reler_documento(p_documento uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  if auth.uid() is null or not privado.usuario_aprovado() then
    raise exception 'acesso negado';
  end if;
  update public.documentos
     set status = 'pendente', tentativas = 0, erro = null, erro_detalhe = null, status_em = now()
   where id = p_documento and usuario_id = auth.uid() and status = 'erro';
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke all on function public.reler_documento(uuid) from public, anon;
grant execute on function public.reler_documento(uuid) to authenticated;
