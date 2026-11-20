-- Espaços compartilhados (grupos do WhatsApp).
--   * um ESPAÇO tem membros (contas aprovadas no site) e pode ser ligado a
--     um grupo do WhatsApp;
--   * o robô guarda o que os MEMBROS mandam no grupo (mensagens, áudios
--     transcritos, documentos e fotos) e responde só quando é mencionado;
--   * os arquivos vão para o Google Drive do espaço (se conectado) ou para
--     o cofre "espacos" do Supabase; o texto lido e os vetores ficam aqui;
--   * tudo é separado do cérebro pessoal: a busca do espaço nunca vê dados
--     pessoais e a busca pessoal nunca vê o espaço.
-- Quem grava mensagens, documentos e trechos é só o robô (chave de servidor).
-- Membros e códigos são mexidos só por funções que conferem quem é admin.

-- ---------------------------------------------------------------------
-- ESPAÇOS
-- ---------------------------------------------------------------------
create table public.espacos (
  id                     uuid primary key default gen_random_uuid(),
  nome                   text not null check (char_length(btrim(nome)) between 1 and 60),
  grupo_jid              text unique check (grupo_jid ~ '^[0-9-]{5,60}@g\.us$'),
  grupo_nome             text check (char_length(grupo_nome) <= 200),
  codigo_ligacao         text unique check (codigo_ligacao ~ '^[A-Z2-9]{6}$'),
  codigo_expira_em       timestamptz,
  drive_segredo_cifrado  text check (char_length(drive_segredo_cifrado) <= 4000),
  drive_conta            text check (char_length(drive_conta) <= 200),
  drive_pasta_id         text check (char_length(drive_pasta_id) <= 200),
  drive_situacao         text check (drive_situacao in ('ok', 'erro')),
  criado_em              timestamptz not null default now()
);

create table public.espaco_membros (
  espaco_id   uuid not null references public.espacos (id) on delete cascade,
  usuario_id  uuid not null references public.perfis (id) on delete cascade,
  papel       text not null default 'membro' check (papel in ('admin', 'membro')),
  criado_em   timestamptz not null default now(),
  primary key (espaco_id, usuario_id)
);
create index espaco_membros_usuario on public.espaco_membros (usuario_id);

-- quem está logado é membro (ou admin) deste espaço, com cadastro aprovado?
create function privado.membro_do_espaco(p_espaco uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select privado.usuario_aprovado() and exists (
    select 1 from public.espaco_membros m
     where m.espaco_id = p_espaco and m.usuario_id = auth.uid()
  );
$$;
create function privado.admin_do_espaco(p_espaco uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select privado.usuario_aprovado() and exists (
    select 1 from public.espaco_membros m
     where m.espaco_id = p_espaco and m.usuario_id = auth.uid() and m.papel = 'admin'
  );
$$;
revoke all on function privado.membro_do_espaco(uuid) from public;
revoke all on function privado.admin_do_espaco(uuid) from public;
grant execute on function privado.membro_do_espaco(uuid) to authenticated, service_role;
grant execute on function privado.admin_do_espaco(uuid) to authenticated, service_role;

alter table public.espacos enable row level security;
revoke all on public.espacos from anon, authenticated;
-- membros veem o espaço, nunca o token do Drive nem o código de ligação
grant select (id, nome, grupo_jid, grupo_nome, drive_conta, drive_situacao, criado_em) on public.espacos to authenticated;
grant update (nome) on public.espacos to authenticated;
create policy membro_ver on public.espacos for select to authenticated
  using (privado.membro_do_espaco(id));
create policy admin_renomear on public.espacos for update to authenticated
  using (privado.admin_do_espaco(id)) with check (privado.admin_do_espaco(id));

alter table public.espaco_membros enable row level security;
revoke all on public.espaco_membros from anon, authenticated;
grant select on public.espaco_membros to authenticated;
create policy membro_ver on public.espaco_membros for select to authenticated
  using (privado.membro_do_espaco(espaco_id));

-- Espaço nunca fica sem administrador: se o último sair (ou excluir a
-- conta), o membro mais antigo vira admin; sem ninguém, o espaço é apagado.
create function privado.espaco_sem_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- o próprio espaço está sendo apagado (cascata): nada a fazer
  if not exists (select 1 from public.espacos where id = old.espaco_id) then
    return null;
  end if;
  if exists (select 1 from public.espaco_membros where espaco_id = old.espaco_id and papel = 'admin') then
    return null;
  end if;
  if exists (select 1 from public.espaco_membros where espaco_id = old.espaco_id) then
    update public.espaco_membros set papel = 'admin'
     where espaco_id = old.espaco_id
       and usuario_id = (select usuario_id from public.espaco_membros
                          where espaco_id = old.espaco_id order by criado_em, usuario_id limit 1);
  else
    delete from public.espacos where id = old.espaco_id;
  end if;
  return null;
end $$;
revoke all on function privado.espaco_sem_admin() from public, anon, authenticated;
create trigger espaco_sem_admin after delete or update of papel on public.espaco_membros
  for each row execute function privado.espaco_sem_admin();

-- ---------------------------------------------------------------------
-- FUNÇÕES DO SITE (cada uma confere quem pode)
-- ---------------------------------------------------------------------
create function public.criar_espaco(p_nome text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  novo uuid;
begin
  if auth.uid() is null or not privado.usuario_aprovado() then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  if (select count(*) from public.espaco_membros where usuario_id = auth.uid() and papel = 'admin') >= 20 then
    raise exception 'limite de espaços' using errcode = '54000';
  end if;
  insert into public.espacos (nome) values (btrim(p_nome)) returning id into novo;
  insert into public.espaco_membros (espaco_id, usuario_id, papel) values (novo, auth.uid(), 'admin');
  return novo;
end $$;

-- Código de 6 letras/números para ligar o grupo (vale 30 minutos).
create function public.gerar_codigo_espaco(p_espaco uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  letras constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea;
  codigo text;
begin
  if not privado.admin_do_espaco(p_espaco) then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  loop
    bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    codigo := '';
    for i in 0..5 loop
      codigo := codigo || substr(letras, (get_byte(bytes, i) % 32) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.espacos where codigo_ligacao = codigo);
  end loop;
  update public.espacos set codigo_ligacao = codigo, codigo_expira_em = now() + interval '30 minutes'
   where id = p_espaco;
  return codigo;
end $$;

create function public.desligar_grupo_espaco(p_espaco uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not privado.admin_do_espaco(p_espaco) then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  update public.espacos set grupo_jid = null, grupo_nome = null, codigo_ligacao = null, codigo_expira_em = null
   where id = p_espaco;
end $$;

create function public.desconectar_drive_espaco(p_espaco uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not privado.admin_do_espaco(p_espaco) then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  update public.espacos
     set drive_segredo_cifrado = null, drive_conta = null, drive_pasta_id = null, drive_situacao = null
   where id = p_espaco;
end $$;

-- Adiciona pelo e-mail do cadastro (só contas aprovadas).
create function public.adicionar_membro_espaco(p_espaco uuid, p_email text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  pessoa uuid;
begin
  if not privado.admin_do_espaco(p_espaco) then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  select id into pessoa from public.perfis
   where lower(email) = lower(btrim(p_email)) and status = 'aprovado';
  if pessoa is null then
    return 'nao_encontrado';
  end if;
  if exists (select 1 from public.espaco_membros where espaco_id = p_espaco and usuario_id = pessoa) then
    return 'ja_membro';
  end if;
  if (select count(*) from public.espaco_membros where espaco_id = p_espaco) >= 100 then
    return 'limite';
  end if;
  insert into public.espaco_membros (espaco_id, usuario_id) values (p_espaco, pessoa);
  return 'ok';
end $$;

-- Admin tira qualquer um; qualquer membro pode sair sozinho.
create function public.remover_membro_espaco(p_espaco uuid, p_usuario uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  if not (privado.admin_do_espaco(p_espaco) or (p_usuario = auth.uid() and privado.membro_do_espaco(p_espaco))) then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  delete from public.espaco_membros where espaco_id = p_espaco and usuario_id = p_usuario;
  get diagnostics n = row_count;
  return n > 0;
end $$;

create function public.definir_papel_espaco(p_espaco uuid, p_usuario uuid, p_papel text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  if not privado.admin_do_espaco(p_espaco) then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  if p_papel not in ('admin', 'membro') then
    raise exception 'papel inválido' using errcode = '22023';
  end if;
  update public.espaco_membros set papel = p_papel where espaco_id = p_espaco and usuario_id = p_usuario;
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- Lista de membros com o nome (o perfil dos outros continua fechado).
create function public.membros_do_espaco(p_espaco uuid)
returns table (usuario_id uuid, nome text, papel text, whatsapp_ok boolean, entrou_em timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not privado.membro_do_espaco(p_espaco) then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  return query
    select m.usuario_id, p.nome, m.papel, (p.celular_verificado and p.status = 'aprovado'), m.criado_em
      from public.espaco_membros m join public.perfis p on p.id = m.usuario_id
     where m.espaco_id = p_espaco
     order by m.papel, p.nome;
end $$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'criar_espaco(text)', 'gerar_codigo_espaco(uuid)', 'desligar_grupo_espaco(uuid)',
    'desconectar_drive_espaco(uuid)', 'adicionar_membro_espaco(uuid, text)',
    'remover_membro_espaco(uuid, uuid)', 'definir_papel_espaco(uuid, uuid, text)', 'membros_do_espaco(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- DOCUMENTOS DO ESPAÇO
-- ---------------------------------------------------------------------
create table public.espaco_documentos (
  id                 uuid primary key default gen_random_uuid(),
  espaco_id          uuid not null references public.espacos (id) on delete cascade,
  enviado_por        uuid references public.perfis (id) on delete set null,
  enviado_por_nome   text not null default '' check (char_length(enviado_por_nome) <= 100),
  nome_arquivo       text not null check (char_length(nome_arquivo) between 1 and 255),
  descricao          text not null default '' check (char_length(descricao) <= 1000),
  tipo_mime          text,
  tamanho_bytes      bigint not null check (tamanho_bytes between 1 and 20971520),
  armazenamento      text not null check (armazenamento in ('supabase', 'drive')),
  caminho            text unique,
  drive_id           text check (char_length(drive_id) <= 200),
  mensagem_whatsapp  jsonb,            -- chave da mensagem no grupo (para reagir ✅)
  status             text not null default 'pendente' check (status in ('pendente', 'processando', 'pronto', 'erro')),
  status_em          timestamptz not null default now(),
  tentativas         integer not null default 0,
  resumo             text check (char_length(resumo) <= 600),
  erro               text check (char_length(erro) <= 300),
  erro_detalhe       text check (char_length(erro_detalhe) <= 500),
  processado_em      timestamptz,
  criado_em          timestamptz not null default now(),
  unique (id, espaco_id),
  check (caminho is null or caminho like espaco_id::text || '/%'),
  check ((armazenamento = 'supabase' and caminho is not null) or (armazenamento = 'drive' and drive_id is not null))
);
create index espaco_documentos_espaco on public.espaco_documentos (espaco_id, criado_em desc);
create index espaco_documentos_a_processar on public.espaco_documentos (status_em)
  where status in ('pendente', 'processando');

alter table public.espaco_documentos enable row level security;
revoke all on public.espaco_documentos from anon, authenticated;
grant select (id, espaco_id, enviado_por, enviado_por_nome, nome_arquivo, descricao, tipo_mime, tamanho_bytes,
              armazenamento, status, resumo, erro, criado_em) on public.espaco_documentos to authenticated;
create policy membro_ver on public.espaco_documentos for select to authenticated
  using (privado.membro_do_espaco(espaco_id));
-- apagar é pelo robô (ele também tira o arquivo do Drive/cofre e confere a permissão)

-- ---------------------------------------------------------------------
-- MENSAGENS DO GRUPO (memória do espaço)
-- ---------------------------------------------------------------------
create table public.espaco_mensagens (
  id           bigint generated always as identity primary key,
  espaco_id    uuid not null references public.espacos (id) on delete cascade,
  autor_id     uuid references public.perfis (id) on delete cascade,   -- excluir a conta apaga as falas
  autor_nome   text not null check (char_length(autor_nome) between 1 and 100),
  do_robo      boolean not null default false,
  tipo         text not null default 'texto' check (tipo in ('texto', 'audio')),
  texto        text not null check (char_length(texto) between 1 and 4000),
  id_whatsapp  text check (char_length(id_whatsapp) <= 200),
  indexada     boolean not null default false,
  criado_em    timestamptz not null default now(),
  unique (id, espaco_id),
  check (do_robo or autor_id is not null)
);
create index espaco_mensagens_espaco on public.espaco_mensagens (espaco_id, criado_em desc);
create index espaco_mensagens_a_indexar on public.espaco_mensagens (criado_em) where not indexada;

alter table public.espaco_mensagens enable row level security;
revoke all on public.espaco_mensagens from anon, authenticated;
grant select (id, espaco_id, autor_id, autor_nome, do_robo, tipo, texto, criado_em) on public.espaco_mensagens to authenticated;
grant delete on public.espaco_mensagens to authenticated;
create policy membro_ver on public.espaco_mensagens for select to authenticated
  using (privado.membro_do_espaco(espaco_id));
-- cada um pode apagar as próprias falas guardadas (LGPD)
create policy autor_apagar on public.espaco_mensagens for delete to authenticated
  using (autor_id = (select auth.uid()) and privado.membro_do_espaco(espaco_id));

-- ---------------------------------------------------------------------
-- TRECHOS DO ESPAÇO (texto + vetor). Só o robô lê e grava.
-- ---------------------------------------------------------------------
create table public.espaco_trechos (
  id            bigint generated always as identity primary key,
  espaco_id     uuid not null references public.espacos (id) on delete cascade,
  documento_id  uuid,
  mensagem_id   bigint,
  posicao       integer not null default 0,
  conteudo      text not null check (char_length(conteudo) between 1 and 4000),
  vetor         extensions.vector(768) not null,
  criado_em     timestamptz not null default now(),
  -- o trecho só aponta para documento/mensagem do MESMO espaço
  foreign key (documento_id, espaco_id) references public.espaco_documentos (id, espaco_id) on delete cascade,
  foreign key (mensagem_id, espaco_id) references public.espaco_mensagens (id, espaco_id) on delete cascade,
  check (num_nonnulls(documento_id, mensagem_id) = 1)
);
create index espaco_trechos_espaco on public.espaco_trechos (espaco_id);
create index espaco_trechos_documento on public.espaco_trechos (documento_id) where documento_id is not null;
create index espaco_trechos_mensagem on public.espaco_trechos (mensagem_id) where mensagem_id is not null;

alter table public.espaco_trechos enable row level security;   -- sem regra: ninguém logado acessa
revoke all on public.espaco_trechos from anon, authenticated;

-- Busca pelo sentido SEMPRE dentro de um único espaço. Só o servidor chama.
create function public.buscar_trechos_espaco(p_espaco uuid, p_vetor extensions.vector, p_limite integer default 8)
returns table (documento_id uuid, mensagem_id bigint, conteudo text, distancia double precision)
language sql stable set search_path = '' as $$
  select t.documento_id, t.mensagem_id, t.conteudo,
         (t.vetor operator(extensions.<=>) p_vetor)::double precision
    from public.espaco_trechos t
   where t.espaco_id = p_espaco
   order by t.vetor operator(extensions.<=>) p_vetor
   limit least(greatest(coalesce(p_limite, 8), 1), 30);
$$;
revoke all on function public.buscar_trechos_espaco(uuid, extensions.vector, integer) from public, anon, authenticated;
grant execute on function public.buscar_trechos_espaco(uuid, extensions.vector, integer) to service_role;

-- ---------------------------------------------------------------------
-- COFRE dos arquivos do espaço (quando o Drive não está conectado).
-- Sem regras: só o robô acessa; o site baixa pelo robô.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('espacos', 'espacos', false, 20971520)
on conflict (id) do nothing;
