-- =====================================================================
-- Assistente Pessoal — estrutura do banco (etapa 1)
--
-- Regra de ouro: cada pessoa só enxerga e mexe nos PRÓPRIOS dados, e só
-- depois que o cadastro dela foi APROVADO pelo administrador.
-- Isso é garantido aqui no banco (RLS), não só no código do site/robô.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Esquema "privado": funções auxiliares que o site não chama direto
-- (não ficam expostas pela API do Supabase).
-- ---------------------------------------------------------------------
create schema if not exists privado;
revoke all on schema privado from public;
grant usage on schema privado to authenticated, service_role;

-- Tabelas novas não ficam abertas para visitantes não logados (anon).
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon, public;

create type public.status_cadastro as enum ('pendente', 'aprovado', 'recusado');

-- =====================================================================
-- PERFIS (um por conta; criado automaticamente no cadastro)
-- =====================================================================
create table public.perfis (
  id                  uuid primary key references auth.users (id) on delete cascade,
  nome                text not null check (char_length(btrim(nome)) between 1 and 100),
  email               text not null,
  celular             text check (celular ~ '^[0-9]{10,15}$'),          -- só dígitos, com DDI: 5511999998888
  celular_verificado  boolean not null default false,                    -- só o servidor marca como true
  status              public.status_cadastro not null default 'pendente',
  is_admin            boolean not null default false,
  nome_assistente     text not null default 'Assistente'
                        check (nome_assistente ~ '^[A-Za-zÀ-ÖØ-öø-ÿ]{1,30}$'),  -- só letras, até 30
  resumo_manha        boolean not null default true,
  ultimo_resumo_em    date,
  aprovado_em         timestamptz,
  criado_em           timestamptz not null default now()
);
-- Um mesmo celular verificado não pode pertencer a duas contas.
create unique index perfis_celular_verificado_unico on public.perfis (celular) where celular_verificado;

-- =====================================================================
-- CATEGORIAS de despesa (cada pessoa tem as suas)
-- =====================================================================
create table public.categorias (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references public.perfis (id) on delete cascade,
  nome        text not null check (char_length(btrim(nome)) between 1 and 40),
  criado_em   timestamptz not null default now(),
  unique (id, usuario_id)
);
create unique index categorias_nome_unico on public.categorias (usuario_id, lower(btrim(nome)));

-- =====================================================================
-- DESPESAS FIXAS (lançadas sozinhas todo mês)
-- =====================================================================
create table public.despesas_fixas (
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid not null references public.perfis (id) on delete cascade,
  descricao       text not null check (char_length(btrim(descricao)) between 1 and 200),
  valor           numeric(12, 2) not null check (valor > 0),
  categoria_id    uuid not null,
  dia_vencimento  smallint not null check (dia_vencimento between 1 and 31),
  ativa           boolean not null default true,
  criado_em       timestamptz not null default now(),
  unique (id, usuario_id),
  -- A categoria precisa ser DA MESMA pessoa (não dá para usar a de outra conta).
  foreign key (categoria_id, usuario_id) references public.categorias (id, usuario_id)
);
create index despesas_fixas_usuario on public.despesas_fixas (usuario_id);

-- =====================================================================
-- DESPESAS
-- =====================================================================
create table public.despesas (
  id               uuid primary key default gen_random_uuid(),
  usuario_id       uuid not null references public.perfis (id) on delete cascade,
  valor            numeric(12, 2) not null check (valor > 0),
  categoria_id     uuid not null,
  descricao        text not null default '' check (char_length(descricao) <= 200),
  data             date not null default (now() at time zone 'America/Sao_Paulo')::date,
  despesa_fixa_id  uuid,
  origem           text not null default 'site' check (origem in ('site', 'whatsapp', 'fixa')),
  criado_em        timestamptz not null default now(),
  foreign key (categoria_id, usuario_id) references public.categorias (id, usuario_id),
  foreign key (despesa_fixa_id, usuario_id) references public.despesas_fixas (id, usuario_id)
    on delete set null (despesa_fixa_id)
);
create index despesas_usuario_data on public.despesas (usuario_id, data);
create index despesas_categoria on public.despesas (categoria_id);
-- Uma despesa fixa nunca é lançada duas vezes no mesmo mês.
create unique index despesas_fixa_uma_por_mes
  on public.despesas (despesa_fixa_id, date_trunc('month', data::timestamp))
  where despesa_fixa_id is not null;

-- =====================================================================
-- ORÇAMENTO por categoria + registro dos avisos já mandados
-- =====================================================================
create table public.orcamentos (
  id             uuid primary key default gen_random_uuid(),
  usuario_id     uuid not null references public.perfis (id) on delete cascade,
  categoria_id   uuid not null,
  limite_mensal  numeric(12, 2) not null check (limite_mensal > 0),
  criado_em      timestamptz not null default now(),
  unique (usuario_id, categoria_id),
  foreign key (categoria_id, usuario_id) references public.categorias (id, usuario_id) on delete cascade
);

create table public.alertas_orcamento (
  usuario_id    uuid not null references public.perfis (id) on delete cascade,
  categoria_id  uuid not null references public.categorias (id) on delete cascade,
  mes           date not null,             -- sempre o dia 1 do mês
  nivel         smallint not null check (nivel in (80, 100)),
  enviado_em    timestamptz not null default now(),
  primary key (usuario_id, categoria_id, mes, nivel)
);

-- =====================================================================
-- TAREFAS
-- =====================================================================
create table public.tarefas (
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid not null references public.perfis (id) on delete cascade,
  titulo        text not null check (char_length(btrim(titulo)) between 1 and 300),
  concluida     boolean not null default false,
  concluida_em  timestamptz,
  criado_em     timestamptz not null default now()
);
create index tarefas_usuario on public.tarefas (usuario_id, concluida);

-- =====================================================================
-- LEMBRETES
-- pendente -> enviando (reservado pelo robô) -> enviado
--                     \-> volta a pendente se o WhatsApp falhar
-- =====================================================================
create table public.lembretes (
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid not null references public.perfis (id) on delete cascade,
  texto         text not null check (char_length(btrim(texto)) between 1 and 500),
  quando        timestamptz not null,
  status        text not null default 'pendente'
                  check (status in ('pendente', 'enviando', 'enviado', 'cancelado', 'falhou')),
  tentativas    integer not null default 0,
  reservado_em  timestamptz,
  enviado_em    timestamptz,
  ultimo_erro   text,
  criado_em     timestamptz not null default now()
);
create index lembretes_usuario on public.lembretes (usuario_id, quando);
create index lembretes_a_enviar on public.lembretes (quando) where status in ('pendente', 'enviando');

-- =====================================================================
-- MEMÓRIAS (informações pessoais)
-- =====================================================================
create table public.memorias (
  id             uuid primary key default gen_random_uuid(),
  usuario_id     uuid not null references public.perfis (id) on delete cascade,
  texto          text not null check (char_length(btrim(texto)) between 1 and 1000),
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
create index memorias_usuario on public.memorias (usuario_id);

-- =====================================================================
-- DECISÕES e seus prós/contras
-- =====================================================================
create table public.decisoes (
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid not null references public.perfis (id) on delete cascade,
  titulo       text not null check (char_length(btrim(titulo)) between 1 and 200),
  contexto     text check (char_length(contexto) <= 2000),
  status       text not null default 'aberta' check (status in ('aberta', 'decidida')),
  decisao      text check (char_length(decisao) <= 2000),
  motivo       text check (char_length(motivo) <= 2000),
  decidida_em  date,
  criado_em    timestamptz not null default now(),
  unique (id, usuario_id)
);
create index decisoes_usuario on public.decisoes (usuario_id);

create table public.decisao_pontos (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references public.perfis (id) on delete cascade,
  decisao_id  uuid not null,
  tipo        text not null check (tipo in ('pro', 'contra')),
  texto       text not null check (char_length(btrim(texto)) between 1 and 500),
  criado_em   timestamptz not null default now(),
  foreign key (decisao_id, usuario_id) references public.decisoes (id, usuario_id) on delete cascade
);
create index decisao_pontos_decisao on public.decisao_pontos (decisao_id);
create index decisao_pontos_usuario on public.decisao_pontos (usuario_id);

-- =====================================================================
-- DOCUMENTOS (o arquivo fica no Storage, aqui fica a ficha dele)
-- =====================================================================
create table public.documentos (
  id             uuid primary key default gen_random_uuid(),
  usuario_id     uuid not null references public.perfis (id) on delete cascade,
  nome_arquivo   text not null check (char_length(nome_arquivo) between 1 and 255),
  descricao      text not null default '' check (char_length(descricao) <= 1000),
  caminho        text not null unique,
  tipo_mime      text,
  tamanho_bytes  bigint not null check (tamanho_bytes between 1 and 20971520),  -- até 20 MB
  criado_em      timestamptz not null default now(),
  -- o arquivo tem que estar na pasta da própria pessoa
  check (caminho like usuario_id::text || '/%')
);
create index documentos_usuario on public.documentos (usuario_id);

-- =====================================================================
-- TABELAS SÓ DO ROBÔ (o site/usuário não acessa nenhuma delas)
-- =====================================================================
create table public.mensagens_conversa (           -- memória curta da conversa no WhatsApp
  id          bigint generated always as identity primary key,
  usuario_id  uuid not null references public.perfis (id) on delete cascade,
  papel       text not null check (papel in ('usuario', 'assistente')),
  conteudo    text not null,
  criado_em   timestamptz not null default now()
);
create index mensagens_conversa_usuario on public.mensagens_conversa (usuario_id, criado_em desc);

create table public.acoes_pendentes (              -- "Confirma?" esperando resposta
  usuario_id  uuid primary key references public.perfis (id) on delete cascade,
  tipo        text not null,
  dados       jsonb not null,
  criado_em   timestamptz not null default now(),
  expira_em   timestamptz not null default now() + interval '30 minutes'
);

create table public.codigos_verificacao (          -- código de 6 dígitos do WhatsApp
  usuario_id   uuid primary key references public.perfis (id) on delete cascade,
  celular      text not null,
  codigo_hash  text not null,
  tentativas   integer not null default 0,
  expira_em    timestamptz not null,
  criado_em    timestamptz not null default now()
);

create table public.mensagens_recebidas (          -- para ignorar mensagens repetidas
  id_mensagem  text primary key,
  recebida_em  timestamptz not null default now()
);

-- =====================================================================
-- FUNÇÕES AUXILIARES DE SEGURANÇA
-- =====================================================================
create function privado.usuario_aprovado()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.perfis
    where id = auth.uid() and status = 'aprovado'
  );
$$;

-- Administrador: precisa ser admin, aprovado E ter entrado com 2FA (aal2).
create function privado.eh_admin_com_2fa()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (
       select 1 from public.perfis
       where id = auth.uid() and is_admin and status = 'aprovado'
     );
$$;

revoke all on function privado.usuario_aprovado() from public;
revoke all on function privado.eh_admin_com_2fa() from public;
grant execute on function privado.usuario_aprovado() to authenticated, service_role;
grant execute on function privado.eh_admin_com_2fa() to authenticated, service_role;

-- =====================================================================
-- CADASTRO NOVO: cria o perfil (pendente) e as categorias padrão
-- =====================================================================
create function privado.criar_perfil_novo_usuario()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_celular text := nullif(regexp_replace(coalesce(new.raw_user_meta_data ->> 'celular', ''), '\D', '', 'g'), '');
begin
  if v_celular is not null and v_celular !~ '^[0-9]{10,15}$' then
    v_celular := null;
  end if;

  insert into public.perfis (id, nome, email, celular)
  values (
    new.id,
    left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nome'), ''), split_part(new.email, '@', 1)), 100),
    coalesce(new.email, ''),
    v_celular
  );

  insert into public.categorias (usuario_id, nome)
  select new.id, c from unnest(array[
    'Mercado', 'Restaurante', 'Moradia', 'Contas', 'Transporte', 'Saúde',
    'Educação', 'Lazer', 'Compras', 'Assinaturas', 'Outros'
  ]) as c;

  return new;
end $$;
revoke all on function privado.criar_perfil_novo_usuario() from public;

create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function privado.criar_perfil_novo_usuario();

-- Trocou o celular? Precisa verificar de novo.
create function privado.celular_mudou_reverificar()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.celular is distinct from old.celular then
    new.celular_verificado := false;
  end if;
  return new;
end $$;
revoke all on function privado.celular_mudou_reverificar() from public;

create trigger perfis_celular_mudou
  before update on public.perfis
  for each row execute function privado.celular_mudou_reverificar();

-- =====================================================================
-- TRAVAS (RLS)
-- =====================================================================

-- PERFIS: a pessoa vê o próprio perfil (mesmo pendente, para a tela
-- "aguardando aprovação"); o admin com 2FA vê todos.
alter table public.perfis enable row level security;

create policy perfis_ver_o_proprio on public.perfis
  for select to authenticated using (id = (select auth.uid()));
create policy perfis_admin_ve_todos on public.perfis
  for select to authenticated using ((select privado.eh_admin_com_2fa()));
create policy perfis_editar_o_proprio on public.perfis
  for update to authenticated
  using (id = (select auth.uid()) and (select privado.usuario_aprovado()))
  with check (id = (select auth.uid()));

-- O usuário só pode mudar estes campos do próprio perfil.
-- (status, is_admin e celular_verificado NUNCA são mexidos pelo usuário)
revoke insert, update, delete, truncate, references, trigger on public.perfis from authenticated, anon;
grant update (nome, celular, nome_assistente, resumo_manha) on public.perfis to authenticated;

-- Tabelas de dados pessoais: mesma regra em todas
--   dono = quem está logado  E  cadastro aprovado
do $$
declare
  t text;
begin
  foreach t in array array[
    'categorias', 'despesas_fixas', 'despesas', 'orcamentos', 'tarefas',
    'lembretes', 'memorias', 'decisoes', 'decisao_pontos', 'documentos'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy dono_ver on public.%I for select to authenticated
      using (usuario_id = (select auth.uid()) and (select privado.usuario_aprovado()))$p$, t);
    execute format($p$create policy dono_criar on public.%I for insert to authenticated
      with check (usuario_id = (select auth.uid()) and (select privado.usuario_aprovado()))$p$, t);
    execute format($p$create policy dono_editar on public.%I for update to authenticated
      using (usuario_id = (select auth.uid()) and (select privado.usuario_aprovado()))
      with check (usuario_id = (select auth.uid()) and (select privado.usuario_aprovado()))$p$, t);
    execute format($p$create policy dono_apagar on public.%I for delete to authenticated
      using (usuario_id = (select auth.uid()) and (select privado.usuario_aprovado()))$p$, t);
    execute format('revoke truncate, references, trigger on public.%I from authenticated', t);
  end loop;
end $$;

-- Avisos de orçamento: a pessoa só consegue LER os dela (quem grava é o robô).
alter table public.alertas_orcamento enable row level security;
create policy dono_ver on public.alertas_orcamento
  for select to authenticated
  using (usuario_id = (select auth.uid()) and (select privado.usuario_aprovado()));
revoke insert, update, delete, truncate, references, trigger on public.alertas_orcamento from authenticated;

-- Tabelas só do robô: RLS ligado e NENHUMA permissão para usuários.
do $$
declare
  t text;
begin
  foreach t in array array['mensagens_conversa', 'acoes_pendentes', 'codigos_verificacao', 'mensagens_recebidas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- Ninguém sem login acessa nada.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- =====================================================================
-- ADMINISTRADOR: aprovar ou recusar cadastros
-- =====================================================================
create function public.admin_definir_status(p_usuario uuid, p_status public.status_cadastro)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not privado.eh_admin_com_2fa() then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  if p_usuario = auth.uid() then
    raise exception 'o administrador não pode alterar o próprio cadastro' using errcode = '42501';
  end if;
  update public.perfis
     set status = p_status,
         aprovado_em = case when p_status = 'aprovado' then now() else aprovado_em end
   where id = p_usuario;
  if not found then
    raise exception 'cadastro não encontrado';
  end if;
end $$;
revoke all on function public.admin_definir_status(uuid, public.status_cadastro) from public, anon;
grant execute on function public.admin_definir_status(uuid, public.status_cadastro) to authenticated;

-- =====================================================================
-- LEMBRETES: funções da rotina do robô (só o servidor chama)
-- Cada lembrete é "reservado" antes de enviar, então duas rotinas
-- rodando ao mesmo tempo nunca pegam o mesmo lembrete.
-- =====================================================================
create function public.reservar_lembretes(p_limite integer default 20)
returns table (id uuid, usuario_id uuid, texto text, quando timestamptz, celular text, tentativas integer)
language sql security invoker set search_path = '' as $$
  with alvo as (
    select l.id
      from public.lembretes l
      join public.perfis p on p.id = l.usuario_id
     where p.status = 'aprovado'
       and p.celular_verificado
       and l.quando <= now()
       and (l.status = 'pendente'
            or (l.status = 'enviando' and l.reservado_em < now() - interval '5 minutes'))
     order by l.quando
     limit p_limite
       for update of l skip locked
  )
  update public.lembretes l
     set status = 'enviando', reservado_em = now(), tentativas = l.tentativas + 1
    from alvo, public.perfis p
   where l.id = alvo.id and p.id = l.usuario_id
  returning l.id, l.usuario_id, l.texto, l.quando, p.celular, l.tentativas;
$$;

-- Só marca como enviado DEPOIS que o WhatsApp aceitou.
create function public.confirmar_envio_lembrete(p_id uuid)
returns boolean language sql security invoker set search_path = '' as $$
  with feito as (
    update public.lembretes
       set status = 'enviado', enviado_em = now(), ultimo_erro = null
     where id = p_id and status = 'enviando'
    returning 1
  )
  select exists (select 1 from feito);
$$;

-- Falhou? Volta para a fila (até 10 tentativas).
create function public.registrar_falha_lembrete(p_id uuid, p_erro text)
returns void language sql security invoker set search_path = '' as $$
  update public.lembretes
     set status = case when tentativas >= 10 then 'falhou' else 'pendente' end,
         reservado_em = null,
         ultimo_erro = left(p_erro, 500)
   where id = p_id and status = 'enviando';
$$;

revoke all on function public.reservar_lembretes(integer) from public, anon, authenticated;
revoke all on function public.confirmar_envio_lembrete(uuid) from public, anon, authenticated;
revoke all on function public.registrar_falha_lembrete(uuid, text) from public, anon, authenticated;
grant execute on function public.reservar_lembretes(integer) to service_role;
grant execute on function public.confirmar_envio_lembrete(uuid) to service_role;
grant execute on function public.registrar_falha_lembrete(uuid, text) to service_role;

-- =====================================================================
-- STORAGE: cofre de documentos (privado, uma pasta por pessoa)
--          e cofre de backups (só o servidor)
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('documentos', 'documentos', false, 20971520),
       ('backups', 'backups', false, null)
on conflict (id) do nothing;

create policy documentos_dono_ver on storage.objects
  for select to authenticated
  using (bucket_id = 'documentos'
         and (storage.foldername(name))[1] = (select auth.uid())::text
         and (select privado.usuario_aprovado()));
create policy documentos_dono_enviar on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documentos'
              and (storage.foldername(name))[1] = (select auth.uid())::text
              and (select privado.usuario_aprovado()));
create policy documentos_dono_editar on storage.objects
  for update to authenticated
  using (bucket_id = 'documentos'
         and (storage.foldername(name))[1] = (select auth.uid())::text
         and (select privado.usuario_aprovado()))
  with check (bucket_id = 'documentos'
              and (storage.foldername(name))[1] = (select auth.uid())::text
              and (select privado.usuario_aprovado()));
create policy documentos_dono_apagar on storage.objects
  for delete to authenticated
  using (bucket_id = 'documentos'
         and (storage.foldername(name))[1] = (select auth.uid())::text
         and (select privado.usuario_aprovado()));
-- (bucket "backups" não tem nenhuma regra: usuários não acessam)
