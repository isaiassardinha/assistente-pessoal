-- Etapa 6: segundo cérebro.
--   * anotações (tabela memorias) e documentos ficam "pesquisáveis pelo sentido":
--     o robô quebra o texto em trechos e guarda, para cada trecho, um vetor
--     (uma lista de números que representa o significado do texto);
--   * a pergunta também vira vetor e o banco devolve os trechos mais parecidos.
-- Quem lê os documentos e cria os trechos é só o robô (chave de servidor).

create schema if not exists extensions;
create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------
-- DOCUMENTOS: situação da leitura pelo robô
-- ---------------------------------------------------------------------
alter table public.documentos
  add column origem        text not null default 'site' check (origem in ('site', 'whatsapp')),
  add column status        text not null default 'pendente'
                           check (status in ('pendente', 'processando', 'pronto', 'erro')),
  add column status_em     timestamptz not null default now(),
  add column tentativas    integer not null default 0,
  add column resumo        text check (char_length(resumo) <= 600),
  add column erro          text check (char_length(erro) <= 300),
  add column processado_em timestamptz,
  add constraint documentos_id_usuario unique (id, usuario_id);

create index documentos_a_processar on public.documentos (status_em)
  where status in ('pendente', 'processando');

-- A pessoa só escolhe nome e descrição; a situação da leitura é do robô.
revoke insert, update on public.documentos from authenticated;
grant insert (usuario_id, nome_arquivo, descricao, caminho, tipo_mime, tamanho_bytes)
  on public.documentos to authenticated;
grant update (nome_arquivo, descricao) on public.documentos to authenticated;

-- ---------------------------------------------------------------------
-- ANOTAÇÕES (memorias): marca se já estão pesquisáveis
-- ---------------------------------------------------------------------
alter table public.memorias
  add column indexada boolean not null default false,
  add column origem   text not null default 'site' check (origem in ('site', 'whatsapp')),
  add constraint memorias_id_usuario unique (id, usuario_id);

create index memorias_a_indexar on public.memorias (criado_em) where not indexada;

revoke insert, update on public.memorias from authenticated;
grant insert (usuario_id, texto) on public.memorias to authenticated;
grant update (texto) on public.memorias to authenticated;

-- ---------------------------------------------------------------------
-- TRECHOS: pedaços de texto + vetor. Só o robô lê e grava.
-- ---------------------------------------------------------------------
create table public.trechos (
  id            bigint generated always as identity primary key,
  usuario_id    uuid not null references public.perfis (id) on delete cascade,
  documento_id  uuid,
  memoria_id    uuid,
  posicao       integer not null default 0,
  conteudo      text not null check (char_length(conteudo) between 1 and 4000),
  vetor         extensions.vector(768) not null,
  criado_em     timestamptz not null default now(),
  -- o trecho só pode apontar para documento/anotação da MESMA pessoa
  foreign key (documento_id, usuario_id) references public.documentos (id, usuario_id) on delete cascade,
  foreign key (memoria_id, usuario_id) references public.memorias (id, usuario_id) on delete cascade,
  check (num_nonnulls(documento_id, memoria_id) = 1)
);
create index trechos_usuario on public.trechos (usuario_id);
create index trechos_documento on public.trechos (documento_id) where documento_id is not null;
create index trechos_memoria on public.trechos (memoria_id) where memoria_id is not null;

alter table public.trechos enable row level security;   -- sem regra: ninguém logado acessa
revoke all on public.trechos from anon, authenticated;

-- Quando o texto de uma anotação muda, os trechos antigos saem e ela volta
-- para a fila do robô.
create function privado.anotacao_mudou() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.texto is distinct from old.texto then
    delete from public.trechos where memoria_id = old.id;
    new.indexada := false;
    new.atualizado_em := now();
  end if;
  return new;
end $$;
revoke all on function privado.anotacao_mudou() from public, anon, authenticated;

create trigger anotacao_mudou before update on public.memorias
  for each row execute function privado.anotacao_mudou();

-- Busca pelo sentido, SEMPRE dentro dos trechos de uma única pessoa.
-- Só o servidor chama (ele informa de quem é a busca).
create function public.buscar_trechos(p_usuario uuid, p_vetor extensions.vector, p_limite integer default 8)
returns table (documento_id uuid, memoria_id uuid, conteudo text, distancia double precision)
language sql stable set search_path = '' as $$
  select t.documento_id, t.memoria_id, t.conteudo,
         (t.vetor operator(extensions.<=>) p_vetor)::double precision
    from public.trechos t
   where t.usuario_id = p_usuario
   order by t.vetor operator(extensions.<=>) p_vetor
   limit least(greatest(coalesce(p_limite, 8), 1), 30);
$$;
revoke all on function public.buscar_trechos(uuid, extensions.vector, integer) from public, anon, authenticated;
grant execute on function public.buscar_trechos(uuid, extensions.vector, integer) to service_role;
