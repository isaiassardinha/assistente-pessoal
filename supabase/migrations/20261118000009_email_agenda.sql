-- Etapa 8: e-mail e agenda pessoais.
--   * conexoes: a senha de app do Gmail e o link secreto da agenda ficam
--     CRIPTOGRAFADOS; só o robô grava e só ele sabe abrir. A pessoa vê que
--     está conectada (e se deu erro), mas nunca lê o segredo de volta;
--   * emails: só remetente, assunto, um resumo curto e a nota de importância
--     (nunca o texto inteiro); o robô apaga depois de 60 dias;
--   * regras_email: "fulano é importante", "ignora a loja X";
--   * avisos_agenda: controle para não avisar o mesmo compromisso duas vezes.

-- ---------------------------------------------------------------------
-- CONEXÕES
-- ---------------------------------------------------------------------
create table public.conexoes (
  id               uuid primary key default gen_random_uuid(),
  usuario_id       uuid not null references public.perfis (id) on delete cascade,
  tipo             text not null check (tipo in ('gmail', 'agenda_ics')),
  conta            text not null check (char_length(conta) between 1 and 200),
  segredo_cifrado  text not null check (char_length(segredo_cifrado) <= 4000),
  estado           jsonb not null default '{}'::jsonb,           -- ex.: último e-mail lido
  situacao         text not null default 'ok' check (situacao in ('ok', 'erro')),
  erro             text check (char_length(erro) <= 300),
  erro_avisado     boolean not null default false,
  ultima_leitura   timestamptz,
  criado_em        timestamptz not null default now(),
  unique (usuario_id, tipo),
  unique (id, usuario_id)
);
alter table public.conexoes enable row level security;
create policy dono_ver on public.conexoes for select to authenticated
  using (usuario_id = (select auth.uid()) and (select privado.usuario_aprovado()));
create policy dono_apagar on public.conexoes for delete to authenticated
  using (usuario_id = (select auth.uid()) and (select privado.usuario_aprovado()));
revoke all on public.conexoes from anon, authenticated;
-- a pessoa vê a situação, nunca o segredo nem o estado interno
grant select (id, usuario_id, tipo, conta, situacao, erro, ultima_leitura, criado_em) on public.conexoes to authenticated;
grant delete on public.conexoes to authenticated;

-- ---------------------------------------------------------------------
-- E-MAILS (resumo)
-- ---------------------------------------------------------------------
create table public.emails (
  id               uuid primary key default gen_random_uuid(),
  usuario_id       uuid not null references public.perfis (id) on delete cascade,
  conexao_id       uuid not null,
  message_id       text not null check (char_length(message_id) <= 500),
  recebido_em      timestamptz not null,
  remetente_nome   text check (char_length(remetente_nome) <= 200),
  remetente_email  text check (char_length(remetente_email) <= 320),
  assunto          text check (char_length(assunto) <= 500),
  resumo           text check (char_length(resumo) <= 600),
  importancia      text not null check (importancia in ('urgente', 'importante', 'normal', 'ignorar')),
  motivo           text check (char_length(motivo) <= 200),
  avisado_em       timestamptz,          -- aviso imediato no WhatsApp
  no_resumo_em     timestamptz,          -- entrou num resumo da manhã
  criado_em        timestamptz not null default now(),
  foreign key (conexao_id, usuario_id) references public.conexoes (id, usuario_id) on delete cascade,
  unique (usuario_id, message_id)
);
create index emails_usuario_recebido on public.emails (usuario_id, recebido_em desc);
create index emails_conexao on public.emails (conexao_id, usuario_id);
alter table public.emails enable row level security;
create policy dono_ver on public.emails for select to authenticated
  using (usuario_id = (select auth.uid()) and (select privado.usuario_aprovado()));
create policy dono_apagar on public.emails for delete to authenticated
  using (usuario_id = (select auth.uid()) and (select privado.usuario_aprovado()));
revoke all on public.emails from anon, authenticated;
grant select, delete on public.emails to authenticated;

-- ---------------------------------------------------------------------
-- REGRAS DE E-MAIL
-- ---------------------------------------------------------------------
create table public.regras_email (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references public.perfis (id) on delete cascade,
  tipo        text not null check (tipo in ('importante', 'ignorar')),
  padrao      text not null check (char_length(btrim(padrao)) between 2 and 200),  -- e-mail, @domínio ou palavra
  criado_em   timestamptz not null default now(),
  unique (usuario_id, tipo, padrao)
);
alter table public.regras_email enable row level security;
create policy dono_ver on public.regras_email for select to authenticated
  using (usuario_id = (select auth.uid()) and (select privado.usuario_aprovado()));
create policy dono_criar on public.regras_email for insert to authenticated
  with check (usuario_id = (select auth.uid()) and (select privado.usuario_aprovado()));
create policy dono_apagar on public.regras_email for delete to authenticated
  using (usuario_id = (select auth.uid()) and (select privado.usuario_aprovado()));
revoke all on public.regras_email from anon, authenticated;
grant select, delete on public.regras_email to authenticated;
grant insert (usuario_id, tipo, padrao) on public.regras_email to authenticated;

-- ---------------------------------------------------------------------
-- AVISOS DE AGENDA (só o robô)
-- ---------------------------------------------------------------------
create table public.avisos_agenda (
  usuario_id   uuid not null references public.perfis (id) on delete cascade,
  evento       text not null check (char_length(evento) <= 600),
  inicio       timestamptz not null,
  avisado_em   timestamptz not null default now(),
  primary key (usuario_id, evento, inicio)
);
create index avisos_agenda_inicio on public.avisos_agenda (inicio);
alter table public.avisos_agenda enable row level security;
revoke all on public.avisos_agenda from anon, authenticated;

-- ---------------------------------------------------------------------
-- Preferências (a pessoa ajusta no site)
-- ---------------------------------------------------------------------
alter table public.perfis
  add column agenda_aviso_minutos smallint not null default 15 check (agenda_aviso_minutos between 0 and 120),
  add column resumo_manha_hora    smallint not null default 7 check (resumo_manha_hora between 5 and 11),
  add column silencio_inicio      smallint not null default 22 check (silencio_inicio between 18 and 23),
  add column silencio_fim         smallint not null default 7 check (silencio_fim between 5 and 10);
grant update (agenda_aviso_minutos, resumo_manha_hora, silencio_inicio, silencio_fim) on public.perfis to authenticated;

-- Consumo da IA ganha o tipo "email"
alter table public.uso_ia drop constraint uso_ia_tipo_check;
alter table public.uso_ia add constraint uso_ia_tipo_check
  check (tipo in ('conversa', 'audio', 'leitura', 'resumo', 'vetores', 'pergunta', 'autoteste', 'email'));
