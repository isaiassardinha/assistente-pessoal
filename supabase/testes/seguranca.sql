-- =====================================================================
-- TESTES DE SEGURANÇA DO BANCO
--
-- Cria pessoas de teste, tenta de tudo para uma mexer nos dados da outra
-- e confere que o banco BLOQUEIA. Deve rodar dentro de uma transação que
-- é desfeita no final (rollback), então não deixa nenhum rastro.
--
-- Pessoas:
--   Ana   - aprovada          Bruno - aprovado
--   Carla - pendente          Davi  - recusado
--   Edu   - administrador (aprovado)
-- =====================================================================

create schema testes;
grant usage on schema testes to anon, authenticated, service_role;

-- verifica uma condição; se for falsa, para tudo com a mensagem
create function testes.ok(condicao boolean, descricao text) returns void
language plpgsql as $$
begin
  if condicao is not true then
    raise exception 'FALHOU: %', descricao;
  end if;
  perform set_config('testes.passou',
    (coalesce(nullif(current_setting('testes.passou', true), ''), '0')::int + 1)::text, true);
end $$;

-- o comando TEM que dar erro (ser bloqueado)
create function testes.deve_bloquear(comando text, descricao text) returns void
language plpgsql as $$
begin
  begin
    execute comando;
  exception when others then
    perform testes.ok(true, descricao);
    return;
  end;
  raise exception 'FALHOU (deveria ter sido bloqueado): %', descricao;
end $$;

-- quantas linhas o comando afetou
create function testes.linhas(comando text) returns bigint
language plpgsql as $$
declare n bigint;
begin
  execute comando;
  get diagnostics n = row_count;
  return n;
end $$;

-- "entrar" como uma pessoa logada
create function testes.como(usuario uuid, aal text default 'aal1') returns void
language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims',
    json_build_object('sub', usuario, 'role', 'authenticated', 'aal', aal)::text, true);
  execute 'set local role authenticated';
end $$;

create function testes.como_anonimo() returns void
language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
end $$;

-- o servidor (robô/site) com a chave mestra
create function testes.como_servidor() returns void
language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  execute 'set local role service_role';
end $$;

create function testes.como_dono_do_banco() returns void
language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;

-- ---------------------------------------------------------------------
-- PREPARAÇÃO
-- ---------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-a000-00000000a001', 'ana@teste.invalid',   '{"nome":"Ana","celular":"+55 (11) 91111-1111"}'),
  ('00000000-0000-4000-a000-00000000b001', 'bruno@teste.invalid', '{"nome":"Bruno","celular":"5511922222222"}'),
  ('00000000-0000-4000-a000-00000000c001', 'carla@teste.invalid', '{"nome":"Carla"}'),
  ('00000000-0000-4000-a000-00000000d001', 'davi@teste.invalid',  '{"nome":"Davi"}'),
  ('00000000-0000-4000-a000-00000000e001', 'edu@teste.invalid',   '{"nome":"Edu"}');

select testes.ok((select count(*) from public.perfis where email like '%@teste.invalid') = 5,
                 'cadastro novo cria o perfil automaticamente');
select testes.ok((select count(*) from public.perfis where email like '%@teste.invalid' and status = 'pendente') = 5,
                 'todo cadastro novo começa PENDENTE');
select testes.ok((select count(*) from public.categorias where usuario_id = '00000000-0000-4000-a000-00000000a001') = 11,
                 'cadastro novo ganha as 11 categorias padrão');
select testes.ok((select celular from public.perfis where id = '00000000-0000-4000-a000-00000000a001') = '5511911111111',
                 'celular do cadastro é guardado só com dígitos');

update public.perfis set status = 'aprovado'
 where id in ('00000000-0000-4000-a000-00000000a001', '00000000-0000-4000-a000-00000000b001',
              '00000000-0000-4000-a000-00000000e001');
update public.perfis set status = 'recusado' where id = '00000000-0000-4000-a000-00000000d001';
update public.perfis set is_admin = true where id = '00000000-0000-4000-a000-00000000e001';
update public.perfis set celular_verificado = true where id = '00000000-0000-4000-a000-00000000b001';

-- Bruno tem um item em cada tabela
insert into public.despesas_fixas (id, usuario_id, descricao, valor, categoria_id, dia_vencimento)
select '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-00000000b001', 'Aluguel', 3000, id, 5
  from public.categorias where usuario_id = '00000000-0000-4000-a000-00000000b001' and nome = 'Moradia';
insert into public.despesas (id, usuario_id, valor, categoria_id, descricao)
select '00000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-00000000b001', 50, id, 'mercado do Bruno'
  from public.categorias where usuario_id = '00000000-0000-4000-a000-00000000b001' and nome = 'Mercado';
insert into public.orcamentos (usuario_id, categoria_id, limite_mensal)
select '00000000-0000-4000-a000-00000000b001', id, 500
  from public.categorias where usuario_id = '00000000-0000-4000-a000-00000000b001' and nome = 'Mercado';
insert into public.alertas_orcamento (usuario_id, categoria_id, mes, nivel)
select '00000000-0000-4000-a000-00000000b001', id, date_trunc('month', now())::date, 80
  from public.categorias where usuario_id = '00000000-0000-4000-a000-00000000b001' and nome = 'Mercado';
insert into public.tarefas (usuario_id, titulo) values ('00000000-0000-4000-a000-00000000b001', 'tarefa do Bruno');
insert into public.lembretes (id, usuario_id, texto, quando) values
  ('00000000-0000-4000-b000-000000000003', '00000000-0000-4000-a000-00000000b001', 'pagar a luz', now() - interval '1 minute');
insert into public.memorias (usuario_id, texto) values ('00000000-0000-4000-a000-00000000b001', 'A placa do carro do Bruno é XYZ9A99');
insert into public.decisoes (id, usuario_id, titulo) values
  ('00000000-0000-4000-b000-000000000004', '00000000-0000-4000-a000-00000000b001', 'Trocar de carro');
insert into public.decisao_pontos (usuario_id, decisao_id, tipo, texto) values
  ('00000000-0000-4000-a000-00000000b001', '00000000-0000-4000-b000-000000000004', 'pro', 'carro novo gasta menos');
insert into public.documentos (usuario_id, nome_arquivo, caminho, tamanho_bytes) values
  ('00000000-0000-4000-a000-00000000b001', 'contrato.pdf', '00000000-0000-4000-a000-00000000b001/contrato.pdf', 1000);
insert into public.contas (id, usuario_id, descricao, valor, categoria_id, vencimento)
select '00000000-0000-4000-b000-000000000005', '00000000-0000-4000-a000-00000000b001', 'Internet do Bruno', 120, id, '2026-03-20'
  from public.categorias where usuario_id = '00000000-0000-4000-a000-00000000b001' and nome = 'Contas';
insert into public.mensagens_conversa (usuario_id, papel, conteudo) values ('00000000-0000-4000-a000-00000000b001', 'usuario', 'oi');
insert into public.codigos_verificacao (usuario_id, celular, codigo_hash, expira_em)
  values ('00000000-0000-4000-a000-00000000b001', '5511922222222', 'x', now() + interval '10 minutes');

-- Carla (pendente) tem um lembrete vencido: não pode ser enviado
insert into public.lembretes (id, usuario_id, texto, quando) values
  ('00000000-0000-4000-c000-000000000003', '00000000-0000-4000-a000-00000000c001', 'lembrete da Carla', now() - interval '1 minute');

-- ---------------------------------------------------------------------
-- 1. ANA NÃO VÊ, NÃO ALTERA E NÃO APAGA NADA DO BRUNO (todas as tabelas)
-- ---------------------------------------------------------------------
select testes.como('00000000-0000-4000-a000-00000000a001');

do $$
declare
  t text;
begin
  foreach t in array array[
    'categorias', 'despesas_fixas', 'despesas', 'orcamentos', 'alertas_orcamento', 'tarefas',
    'lembretes', 'memorias', 'decisoes', 'decisao_pontos', 'documentos', 'contas'
  ] loop
    perform testes.ok(
      testes.linhas(format('select 1 from public.%I where usuario_id = %L', t, '00000000-0000-4000-a000-00000000b001')) = 0,
      format('Ana não LÊ %s do Bruno', t));
    if t <> 'alertas_orcamento' then
      perform testes.ok(
        testes.linhas(format('update public.%I set %I = %I where usuario_id = %L', t,
          case t when 'documentos' then 'descricao' when 'contas' then 'descricao' when 'memorias' then 'texto' else 'usuario_id' end,
          case t when 'documentos' then 'descricao' when 'contas' then 'descricao' when 'memorias' then 'texto' else 'usuario_id' end,
          '00000000-0000-4000-a000-00000000b001')) = 0,
        format('Ana não ALTERA %s do Bruno', t));
      perform testes.ok(
        testes.linhas(format('delete from public.%I where usuario_id = %L', t, '00000000-0000-4000-a000-00000000b001')) = 0,
        format('Ana não APAGA %s do Bruno', t));
    end if;
  end loop;
end $$;

-- e os dados do Bruno continuam todos lá
select testes.como_servidor();
do $$
declare
  t text;
begin
  foreach t in array array[
    'categorias', 'despesas_fixas', 'despesas', 'orcamentos', 'alertas_orcamento', 'tarefas',
    'lembretes', 'memorias', 'decisoes', 'decisao_pontos', 'documentos', 'contas'
  ] loop
    perform testes.ok(
      testes.linhas(format('select 1 from public.%I where usuario_id = %L', t, '00000000-0000-4000-a000-00000000b001')) >= 1,
      format('%s do Bruno continua intacto', t));
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2. ANA NÃO CRIA NADA EM NOME DO BRUNO NEM USA COISAS DELE
-- ---------------------------------------------------------------------
select testes.como('00000000-0000-4000-a000-00000000a001');

select testes.ok(
  (select count(*) from public.categorias) = 11,
  'Ana vê exatamente as 11 categorias dela');

select testes.ok(
  testes.linhas($q$insert into public.despesas (usuario_id, valor, categoria_id, descricao)
     select '00000000-0000-4000-a000-00000000a001', 50, id, 'mercado'
       from public.categorias where nome = 'Mercado'$q$) = 1,
  'Ana lança uma despesa na categoria dela');

select testes.deve_bloquear(
  $q$insert into public.despesas (usuario_id, valor, categoria_id)
     select '00000000-0000-4000-a000-00000000b001', 50, id from public.categorias where nome = 'Mercado'$q$,
  'Ana não lança despesa em nome do Bruno');

select testes.deve_bloquear(
  $q$insert into public.despesas (usuario_id, valor, categoria_id)
     values ('00000000-0000-4000-a000-00000000a001', 50,
             (select id from public.categorias where usuario_id = '00000000-0000-4000-a000-00000000b001' limit 1))$q$,
  'Ana não lança despesa usando a categoria do Bruno (mesmo sabendo o código dela)');

select testes.deve_bloquear(
  $q$insert into public.tarefas (usuario_id, titulo) values ('00000000-0000-4000-a000-00000000b001', 'invasão')$q$,
  'Ana não cria tarefa para o Bruno');

select testes.deve_bloquear(
  $q$insert into public.memorias (usuario_id, texto) values ('00000000-0000-4000-a000-00000000b001', 'invasão')$q$,
  'Ana não cria memória para o Bruno');

select testes.deve_bloquear(
  $q$insert into public.decisao_pontos (usuario_id, decisao_id, tipo, texto)
     values ('00000000-0000-4000-a000-00000000a001', '00000000-0000-4000-b000-000000000004', 'contra', 'invasão')$q$,
  'Ana não adiciona prós/contras na decisão do Bruno');

select testes.deve_bloquear(
  $q$insert into public.documentos (usuario_id, nome_arquivo, caminho, tamanho_bytes)
     values ('00000000-0000-4000-a000-00000000a001', 'x.pdf', '00000000-0000-4000-a000-00000000b001/x.pdf', 10)$q$,
  'Ana não registra documento na pasta do Bruno');

select testes.deve_bloquear(
  $q$update public.despesas set usuario_id = '00000000-0000-4000-a000-00000000b001'
      where usuario_id = '00000000-0000-4000-a000-00000000a001'$q$,
  'Ana não "empurra" uma despesa dela para a conta do Bruno');

select testes.deve_bloquear(
  $q$insert into public.despesas (usuario_id, valor, categoria_id)
     select '00000000-0000-4000-a000-00000000a001', 0, id from public.categorias where nome = 'Mercado'$q$,
  'despesa com valor zero é recusada');

-- ---------------------------------------------------------------------
-- 3. PERFIL: Ana só vê o dela e não se autopromove
-- ---------------------------------------------------------------------
select testes.ok((select count(*) from public.perfis) = 1, 'Ana vê só o próprio perfil');

select testes.deve_bloquear(
  $q$update public.perfis set status = 'aprovado' where id = '00000000-0000-4000-a000-00000000a001'$q$,
  'Ana não mexe no próprio status');
select testes.deve_bloquear(
  $q$update public.perfis set is_admin = true where id = '00000000-0000-4000-a000-00000000a001'$q$,
  'Ana não se torna administradora');
select testes.deve_bloquear(
  $q$update public.perfis set celular_verificado = true where id = '00000000-0000-4000-a000-00000000a001'$q$,
  'Ana não marca o próprio celular como verificado');
select testes.deve_bloquear(
  $q$insert into public.perfis (id, nome, email) values (gen_random_uuid(), 'x', 'x')$q$,
  'Ana não cria perfis');
select testes.deve_bloquear(
  $q$delete from public.perfis where id = '00000000-0000-4000-a000-00000000a001'$q$,
  'perfil não é apagado pelo site direto (exclusão de conta passa pelo servidor)');

select testes.ok(
  testes.linhas($q$update public.perfis set nome_assistente = 'Júnior' where id = '00000000-0000-4000-a000-00000000a001'$q$) = 1,
  'Ana muda o nome do assistente');
select testes.deve_bloquear(
  $q$update public.perfis set nome_assistente = 'R2D2' where id = '00000000-0000-4000-a000-00000000a001'$q$,
  'nome do assistente só aceita letras');
select testes.ok(
  testes.linhas($q$update public.perfis set nome = 'hack' where id = '00000000-0000-4000-a000-00000000b001'$q$) = 0,
  'Ana não muda o nome do Bruno');

-- ---------------------------------------------------------------------
-- 4. TABELAS E FUNÇÕES DO ROBÔ: fechadas para o usuário
-- ---------------------------------------------------------------------
select testes.deve_bloquear('select * from public.codigos_verificacao', 'Ana não lê códigos de verificação');
select testes.deve_bloquear('select * from public.mensagens_conversa', 'Ana não lê conversas do robô');
select testes.deve_bloquear('select * from public.acoes_pendentes', 'Ana não lê ações pendentes');
select testes.deve_bloquear('select * from public.mensagens_recebidas', 'Ana não lê mensagens recebidas');
select testes.deve_bloquear('select * from public.reservar_lembretes(10)', 'Ana não aciona a rotina de lembretes');
select testes.deve_bloquear(
  $q$select public.confirmar_envio_lembrete('00000000-0000-4000-b000-000000000003')$q$,
  'Ana não marca lembretes como enviados');
select testes.deve_bloquear(
  $q$insert into public.alertas_orcamento (usuario_id, categoria_id, mes, nivel)
     select '00000000-0000-4000-a000-00000000a001', id, '2026-01-01', 80 from public.categorias limit 1$q$,
  'Ana não grava avisos de orçamento (só o robô)');
select testes.deve_bloquear(
  $q$select public.admin_definir_status('00000000-0000-4000-a000-00000000c001', 'aprovado')$q$,
  'Ana (não admin) não aprova cadastros');

-- ---------------------------------------------------------------------
-- 5. CADASTROS PENDENTE E RECUSADO: não usam nada
-- ---------------------------------------------------------------------
select testes.como('00000000-0000-4000-a000-00000000c001');
select testes.ok((select count(*) from public.perfis) = 1, 'Carla (pendente) vê o próprio perfil (tela "aguardando aprovação")');
select testes.ok((select count(*) from public.categorias) = 0, 'Carla (pendente) não vê nem as próprias categorias');
select testes.ok((select count(*) from public.lembretes) = 0, 'Carla (pendente) não vê os próprios lembretes');
select testes.deve_bloquear(
  $q$insert into public.tarefas (usuario_id, titulo) values ('00000000-0000-4000-a000-00000000c001', 'x')$q$,
  'Carla (pendente) não cria tarefas');
select testes.ok(
  testes.linhas($q$update public.perfis set nome = 'x' where id = '00000000-0000-4000-a000-00000000c001'$q$) = 0,
  'Carla (pendente) não edita o perfil');

select testes.como('00000000-0000-4000-a000-00000000d001');
select testes.ok((select count(*) from public.categorias) = 0, 'Davi (recusado) não vê nada');
select testes.deve_bloquear(
  $q$insert into public.memorias (usuario_id, texto) values ('00000000-0000-4000-a000-00000000d001', 'x')$q$,
  'Davi (recusado) não grava nada');

-- ---------------------------------------------------------------------
-- 6. VISITANTE SEM LOGIN: nada
-- ---------------------------------------------------------------------
select testes.como_anonimo();
select testes.deve_bloquear('select * from public.despesas', 'visitante sem login não lê despesas');
select testes.deve_bloquear('select * from public.perfis', 'visitante sem login não lê perfis');
select testes.deve_bloquear('select * from public.memorias', 'visitante sem login não lê memórias');
select testes.deve_bloquear(
  $q$select public.admin_definir_status('00000000-0000-4000-a000-00000000c001', 'aprovado')$q$,
  'visitante sem login não aprova cadastros');

-- ---------------------------------------------------------------------
-- 7. ADMINISTRADOR: precisa de 2FA e não vê os dados de ninguém
-- ---------------------------------------------------------------------
select testes.como('00000000-0000-4000-a000-00000000e001', 'aal1');
select testes.ok((select count(*) from public.perfis) = 1, 'admin SEM 2FA não vê a lista de cadastros');
select testes.deve_bloquear(
  $q$select public.admin_definir_status('00000000-0000-4000-a000-00000000c001', 'aprovado')$q$,
  'admin SEM 2FA não aprova cadastros');

select testes.como('00000000-0000-4000-a000-00000000e001', 'aal2');
select testes.ok((select count(*) from public.perfis) >= 5, 'admin COM 2FA vê a lista de cadastros');
select testes.ok((select count(*) from public.despesas) = 0, 'admin não vê as despesas de ninguém');
select testes.ok((select count(*) from public.memorias) = 0, 'admin não vê as memórias de ninguém');
select testes.deve_bloquear(
  $q$select public.admin_definir_status('00000000-0000-4000-a000-00000000e001', 'recusado')$q$,
  'admin não altera o próprio cadastro');
select public.admin_definir_status('00000000-0000-4000-a000-00000000c001', 'aprovado');

select testes.como('00000000-0000-4000-a000-00000000c001');
select testes.ok((select count(*) from public.categorias) = 11, 'depois de aprovada, Carla passa a usar o sistema');

-- ---------------------------------------------------------------------
-- 8. COFRE DE DOCUMENTOS (Storage)
-- ---------------------------------------------------------------------
select testes.como_servidor();
insert into storage.objects (bucket_id, name) values
  ('documentos', '00000000-0000-4000-a000-00000000b001/contrato.pdf'),
  ('backups', 'banco-teste.sql.gpg');
select testes.ok((select not public from storage.buckets where id = 'documentos'), 'cofre de documentos é privado');
select testes.ok((select not public from storage.buckets where id = 'backups'), 'cofre de backups é privado');

select testes.como('00000000-0000-4000-a000-00000000a001');
select testes.ok(
  testes.linhas($q$insert into storage.objects (bucket_id, name)
     values ('documentos', '00000000-0000-4000-a000-00000000a001/rg.pdf')$q$) = 1,
  'Ana guarda arquivo na pasta dela');
select testes.deve_bloquear(
  $q$insert into storage.objects (bucket_id, name)
     values ('documentos', '00000000-0000-4000-a000-00000000b001/intruso.pdf')$q$,
  'Ana não guarda arquivo na pasta do Bruno');
select testes.ok(
  (select count(*) from storage.objects where name like '00000000-0000-4000-a000-00000000b001/%') = 0,
  'Ana não vê os arquivos do Bruno');
select testes.ok((select count(*) from storage.objects where bucket_id = 'backups') = 0, 'Ana não vê os backups');
select testes.deve_bloquear(
  $q$insert into storage.objects (bucket_id, name) values ('backups', 'x.sql')$q$,
  'Ana não grava no cofre de backups');

-- ---------------------------------------------------------------------
-- 9. ROTINA DE LEMBRETES: nunca duplica
-- ---------------------------------------------------------------------
select testes.como_servidor();
select testes.ok(
  (select count(*) from public.reservar_lembretes(100) where id = '00000000-0000-4000-b000-000000000003') = 1,
  'lembrete vencido do Bruno é reservado para envio');
select testes.ok(
  (select count(*) from public.reservar_lembretes(100) where id = '00000000-0000-4000-b000-000000000003') = 0,
  'lembrete já reservado não é pego de novo (sem duplicar)');
select testes.ok(
  (select count(*) from public.reservar_lembretes(100) where id = '00000000-0000-4000-c000-000000000003') = 0,
  'lembrete de cadastro sem celular verificado não é enviado');
select public.registrar_falha_lembrete('00000000-0000-4000-b000-000000000003', 'WhatsApp fora do ar');
select testes.ok(
  (select status from public.lembretes where id = '00000000-0000-4000-b000-000000000003') = 'pendente',
  'se o WhatsApp falhar, o lembrete volta para a fila');
select testes.ok(
  (select count(*) from public.reservar_lembretes(100) where id = '00000000-0000-4000-b000-000000000003') = 1,
  'lembrete que falhou é tentado de novo');
select testes.ok(public.confirmar_envio_lembrete('00000000-0000-4000-b000-000000000003'),
  'lembrete é marcado como enviado depois que o WhatsApp aceita');
select testes.ok(not public.confirmar_envio_lembrete('00000000-0000-4000-b000-000000000003'),
  'confirmar duas vezes não faz nada');
select testes.ok(
  (select count(*) from public.reservar_lembretes(100) where id = '00000000-0000-4000-b000-000000000003') = 0,
  'lembrete enviado nunca é reenviado');

-- ---------------------------------------------------------------------
-- 10. OUTRAS REGRAS DO BANCO
-- ---------------------------------------------------------------------
insert into public.despesas (usuario_id, valor, categoria_id, despesa_fixa_id, origem, data)
select '00000000-0000-4000-a000-00000000b001', 3000, categoria_id, id, 'fixa', '2026-03-05'
  from public.despesas_fixas where id = '00000000-0000-4000-b000-000000000001';
select testes.deve_bloquear(
  $q$insert into public.despesas (usuario_id, valor, categoria_id, despesa_fixa_id, origem, data)
     select '00000000-0000-4000-a000-00000000b001', 3000, categoria_id, id, 'fixa', '2026-03-20'
       from public.despesas_fixas where id = '00000000-0000-4000-b000-000000000001'$q$,
  'despesa fixa não é lançada duas vezes no mesmo mês');

update public.perfis set celular = '5511922222222' where id = '00000000-0000-4000-a000-00000000a001';
select testes.deve_bloquear(
  $q$update public.perfis set celular_verificado = true where id = '00000000-0000-4000-a000-00000000a001'$q$,
  'o mesmo celular verificado não fica em duas contas');

update public.perfis set celular = '5511911111111' where id = '00000000-0000-4000-a000-00000000a001';
update public.perfis set celular_verificado = true where id = '00000000-0000-4000-a000-00000000a001';
update public.perfis set celular = '5511933333333' where id = '00000000-0000-4000-a000-00000000a001';
select testes.ok(
  (select not celular_verificado from public.perfis where id = '00000000-0000-4000-a000-00000000a001'),
  'trocar o celular exige verificar de novo');

select testes.como_dono_do_banco();
select testes.ok(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity) = 0,
  'TODAS as tabelas têm a trava de segurança (RLS) ligada');
select testes.ok(
  not has_function_privilege('anon', 'public.admin_definir_status(uuid, public.status_cadastro)', 'execute')
  and not has_function_privilege('authenticated', 'public.reservar_lembretes(integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.confirmar_envio_lembrete(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.registrar_falha_lembrete(uuid, text)', 'execute'),
  'funções do robô e do admin estão fechadas para quem não deve');

-- ---------------------------------------------------------------------
-- 10b. AVISOS DO ROBÔ: só o servidor lista cadastros a avisar
-- ---------------------------------------------------------------------
select testes.ok(
  not has_function_privilege('authenticated', 'public.cadastros_para_avisar()', 'execute')
  and not has_function_privilege('anon', 'public.cadastros_para_avisar()', 'execute'),
  'usuário comum não lista cadastros pendentes');
select testes.como('00000000-0000-4000-a000-00000000a001');
select testes.deve_bloquear(
  $q$update public.perfis set boas_vindas_em = now() where id = '00000000-0000-4000-a000-00000000a001'$q$,
  'usuário não mexe nos controles de aviso do robô');
select testes.como_dono_do_banco();

-- ---------------------------------------------------------------------
-- 10c. CÉREBRO: trechos pesquisáveis são só do robô e nunca se misturam
-- ---------------------------------------------------------------------
-- vetor de teste: "aponta" para a posição pedida
create function testes.vetor(pos integer) returns extensions.vector
language sql as $$
  select (select array_agg(case when i = pos then 1::real else 0.01::real end order by i)
            from generate_series(1, 768) i)::extensions.vector
$$;

select testes.como_servidor();
insert into public.memorias (id, usuario_id, texto, indexada) values
  ('00000000-0000-4000-a100-000000000001', '00000000-0000-4000-a000-00000000a001', 'A placa do carro da Ana é ANA1B23', true);
insert into public.trechos (usuario_id, memoria_id, conteudo, vetor) values
  ('00000000-0000-4000-a000-00000000a001', '00000000-0000-4000-a100-000000000001', 'A placa do carro da Ana é ANA1B23', testes.vetor(1));
insert into public.trechos (usuario_id, documento_id, conteudo, vetor)
  select usuario_id, id, 'Contrato do Bruno: multa de 3 aluguéis', testes.vetor(1)
    from public.documentos where usuario_id = '00000000-0000-4000-a000-00000000b001';

select testes.ok(
  (select count(*) from public.buscar_trechos('00000000-0000-4000-a000-00000000a001', testes.vetor(1), 10)) = 1
  and (select bool_and(conteudo like '%Ana%') from public.buscar_trechos('00000000-0000-4000-a000-00000000a001', testes.vetor(1), 10)),
  'busca pelo sentido só devolve trechos da própria pessoa');
select testes.deve_bloquear(
  $q$insert into public.trechos (usuario_id, documento_id, conteudo, vetor)
     select '00000000-0000-4000-a000-00000000a001', id, 'x', testes.vetor(2)
       from public.documentos where usuario_id = '00000000-0000-4000-a000-00000000b001'$q$,
  'trecho da Ana não pode apontar para documento do Bruno');
select testes.deve_bloquear(
  $q$insert into public.trechos (usuario_id, conteudo, vetor)
     values ('00000000-0000-4000-a000-00000000a001', 'solto', testes.vetor(2))$q$,
  'trecho sem documento nem anotação é recusado');

select testes.como('00000000-0000-4000-a000-00000000a001');
select testes.deve_bloquear('select * from public.trechos', 'Ana não lê a tabela de trechos diretamente');
select testes.deve_bloquear(
  $q$insert into public.trechos (usuario_id, memoria_id, conteudo, vetor)
     values ('00000000-0000-4000-a000-00000000a001', '00000000-0000-4000-a100-000000000001', 'x', testes.vetor(3))$q$,
  'Ana não grava trechos');
select testes.deve_bloquear(
  $q$select * from public.buscar_trechos('00000000-0000-4000-a000-00000000b001', testes.vetor(1), 5)$q$,
  'Ana não chama a busca (nem para ver o que é do Bruno)');
select testes.ok(
  testes.linhas($q$insert into public.documentos (id, usuario_id, nome_arquivo, caminho, tamanho_bytes)
     values ('00000000-0000-4000-a300-000000000001', '00000000-0000-4000-a000-00000000a001', 'rg.pdf', '00000000-0000-4000-a000-00000000a001/rg.pdf', 500)$q$) = 1,
  'Ana registra documento na pasta dela (o site escolhe o id)');
select testes.ok(
  (select status from public.documentos where caminho = '00000000-0000-4000-a000-00000000a001/rg.pdf') = 'pendente',
  'documento novo entra na fila de leitura');
select testes.deve_bloquear(
  $q$insert into public.documentos (usuario_id, nome_arquivo, caminho, tamanho_bytes, status)
     values ('00000000-0000-4000-a000-00000000a001', 'y.pdf', '00000000-0000-4000-a000-00000000a001/y.pdf', 5, 'pronto')$q$,
  'Ana não registra documento já como "lido"');
select testes.deve_bloquear(
  $q$update public.documentos set status = 'pronto' where usuario_id = '00000000-0000-4000-a000-00000000a001'$q$,
  'Ana não muda a situação da leitura');
select testes.ok(
  testes.linhas($q$update public.documentos set descricao = 'Meu RG' where usuario_id = '00000000-0000-4000-a000-00000000a001'$q$) = 1,
  'Ana muda a descrição do documento dela');
select testes.ok(not public.reler_documento('00000000-0000-4000-a300-000000000001'), 'reler só vale para documento com erro');
select testes.como_servidor();
update public.documentos set status = 'erro', tentativas = 3, erro = 'x', erro_detalhe = 'y' where id = '00000000-0000-4000-a300-000000000001';
select testes.como('00000000-0000-4000-a000-00000000b001');
select testes.ok(not public.reler_documento('00000000-0000-4000-a300-000000000001'), 'Bruno não manda reler documento da Ana');
select testes.como('00000000-0000-4000-a000-00000000a001');
select set_config('testes.releu', public.reler_documento('00000000-0000-4000-a300-000000000001')::text, true);
select testes.ok(current_setting('testes.releu') = 'true'
  and (select status = 'pendente' and tentativas = 0 and erro is null from public.documentos where id = '00000000-0000-4000-a300-000000000001'),
  'Ana manda ler de novo um documento dela que deu erro');
select testes.deve_bloquear($q$update public.documentos set erro_detalhe = 'z'$q$, 'Ana não mexe no motivo técnico');
select testes.deve_bloquear(
  $q$update public.memorias set indexada = true where usuario_id = '00000000-0000-4000-a000-00000000a001'$q$,
  'Ana não marca anotação como pesquisável');
select testes.ok(
  testes.linhas($q$update public.memorias set texto = 'A placa nova da Ana é NOV4A00'
                   where id = '00000000-0000-4000-a100-000000000001'$q$) = 1,
  'Ana edita a anotação dela');

select testes.como_servidor();
select testes.ok(
  (select count(*) from public.trechos where memoria_id = '00000000-0000-4000-a100-000000000001') = 0
  and not (select indexada from public.memorias where id = '00000000-0000-4000-a100-000000000001'),
  'anotação editada perde os trechos antigos e volta para a fila');
delete from public.documentos where usuario_id = '00000000-0000-4000-a000-00000000b001' and nome_arquivo = 'contrato.pdf';
select testes.ok(
  (select count(*) from public.trechos where usuario_id = '00000000-0000-4000-a000-00000000b001') = 0,
  'apagar o documento apaga os trechos dele');
insert into public.documentos (usuario_id, nome_arquivo, caminho, tamanho_bytes) values
  ('00000000-0000-4000-a000-00000000b001', 'contrato.pdf', '00000000-0000-4000-a000-00000000b001/contrato.pdf', 1000);

select testes.como_anonimo();
select testes.deve_bloquear('select * from public.trechos', 'visitante sem login não lê trechos');
select testes.como_dono_do_banco();
select testes.ok(
  not has_function_privilege('authenticated', 'public.buscar_trechos(uuid, extensions.vector, integer)', 'execute')
  and not has_function_privilege('anon', 'public.buscar_trechos(uuid, extensions.vector, integer)', 'execute'),
  'busca pelo sentido fechada para usuários');

-- ---------------------------------------------------------------------
-- 10d. CONTAS A PAGAR
-- ---------------------------------------------------------------------
select testes.como('00000000-0000-4000-a000-00000000a001');
select testes.deve_bloquear(
  $q$insert into public.contas (usuario_id, descricao, valor, categoria_id, vencimento)
     values ('00000000-0000-4000-a000-00000000a001', 'x', 10,
       (select id from public.categorias where usuario_id = '00000000-0000-4000-a000-00000000b001' limit 1), '2026-03-01')$q$,
  'Ana não usa categoria do Bruno numa conta');
select testes.deve_bloquear(
  $q$select public.pagar_conta('00000000-0000-4000-a000-00000000b001', '00000000-0000-4000-b000-000000000005', 120)$q$,
  'Ana não paga conta em nome do Bruno');
select testes.deve_bloquear(
  $q$select public.pagar_conta('00000000-0000-4000-a000-00000000a001', '00000000-0000-4000-b000-000000000005', 120)$q$,
  'Ana não paga a conta do Bruno nem dizendo que é dela');
select testes.deve_bloquear(
  $q$select public.reabrir_conta('00000000-0000-4000-a000-00000000b001', '00000000-0000-4000-b000-000000000005')$q$,
  'Ana não mexe no pagamento do Bruno');

insert into public.contas (id, usuario_id, descricao, valor, categoria_id, vencimento)
select '00000000-0000-4000-a200-000000000001', '00000000-0000-4000-a000-00000000a001', 'Luz', null, id, '2026-03-10'
  from public.categorias where nome = 'Contas';
select testes.ok((select status from public.contas where id = '00000000-0000-4000-a200-000000000001') = 'a_pagar', 'conta nova entra como a pagar');
select testes.deve_bloquear(
  $q$update public.contas set status = 'paga' where id = '00000000-0000-4000-a200-000000000001'$q$,
  'marcar como paga só pela função (que lança o gasto)');
select testes.deve_bloquear(
  $q$update public.contas set ultimo_aviso_em = '2026-01-01' where id = '00000000-0000-4000-a200-000000000001'$q$,
  'Ana não mexe no controle de avisos');
select testes.deve_bloquear(
  $q$update public.contas set despesa_id = '00000000-0000-4000-b000-000000000002' where id = '00000000-0000-4000-a200-000000000001'$q$,
  'Ana não liga a conta a um gasto direto');
select testes.deve_bloquear(
  $q$select public.pagar_conta('00000000-0000-4000-a000-00000000a001', '00000000-0000-4000-a200-000000000001')$q$,
  'conta sem valor não é paga sem dizer o valor');
select testes.ok(
  testes.linhas($q$update public.contas set status = 'ignorada' where id = '00000000-0000-4000-a200-000000000001'$q$) = 1
  and testes.linhas($q$update public.contas set status = 'a_pagar' where id = '00000000-0000-4000-a200-000000000001'$q$) = 1,
  'Ana ignora uma conta e volta atrás');

select set_config('testes.despesa', public.pagar_conta('00000000-0000-4000-a000-00000000a001', '00000000-0000-4000-a200-000000000001', 287.40)::text, true);
select testes.ok(
  (select status = 'paga' and valor = 287.40 and paga_em is not null and despesa_id::text = current_setting('testes.despesa')
     from public.contas where id = '00000000-0000-4000-a200-000000000001'),
  'pagar marca a conta como paga com o valor');
select testes.ok(
  (select count(*) from public.despesas where id::text = current_setting('testes.despesa') and valor = 287.40 and descricao = 'Luz') = 1,
  'pagar lança o gasto em despesas');
select testes.ok(
  public.pagar_conta('00000000-0000-4000-a000-00000000a001', '00000000-0000-4000-a200-000000000001', 999)::text = current_setting('testes.despesa')
  and (select count(*) from public.despesas where descricao = 'Luz') = 1,
  'pagar de novo não lança o gasto duas vezes');
delete from public.despesas where id::text = current_setting('testes.despesa');
select testes.ok(
  (select status = 'a_pagar' and paga_em is null and despesa_id is null from public.contas where id = '00000000-0000-4000-a200-000000000001'),
  'apagar o gasto faz a conta voltar para "a pagar"');
select public.pagar_conta('00000000-0000-4000-a000-00000000a001', '00000000-0000-4000-a200-000000000001');
select public.reabrir_conta('00000000-0000-4000-a000-00000000a001', '00000000-0000-4000-a200-000000000001');
select testes.ok(
  (select status from public.contas where id = '00000000-0000-4000-a200-000000000001') = 'a_pagar'
  and (select count(*) from public.despesas where descricao = 'Luz') = 0,
  'desfazer o pagamento apaga o gasto e reabre a conta');

insert into public.despesas_fixas (id, usuario_id, descricao, valor, categoria_id, dia_vencimento)
select '00000000-0000-4000-a200-000000000002', '00000000-0000-4000-a000-00000000a001', 'Água', null, id, 28
  from public.categorias where nome = 'Contas';
select testes.ok(
  (select count(*) from public.contas where despesa_fixa_id = '00000000-0000-4000-a200-000000000002'
      and vencimento = privado.vencimento_no_mes((date_trunc('month', privado.hoje_sp()) + interval '1 month')::date, 28)) = 1,
  'conta fixa gera sozinha a conta do mês seguinte');
update public.despesas_fixas set valor = 150 where id = '00000000-0000-4000-a200-000000000002';
select testes.ok(
  (select bool_and(valor = 150) from public.contas where despesa_fixa_id = '00000000-0000-4000-a200-000000000002' and status = 'a_pagar'),
  'mudar o valor da conta fixa atualiza as contas ainda não pagas');
update public.contas set valor = 200 where despesa_fixa_id = '00000000-0000-4000-a200-000000000002';
update public.despesas_fixas set valor = 175 where id = '00000000-0000-4000-a200-000000000002';
select testes.ok(
  (select bool_and(valor = 200) from public.contas where despesa_fixa_id = '00000000-0000-4000-a200-000000000002'),
  'valor ajustado no mês ("a água deu 200") não é sobrescrito');
update public.despesas_fixas set ativa = false where id = '00000000-0000-4000-a200-000000000002';
select testes.ok(
  (select count(*) from public.contas where despesa_fixa_id = '00000000-0000-4000-a200-000000000002' and vencimento >= privado.hoje_sp()) = 0,
  'pausar a conta fixa tira as contas futuras não pagas');

select testes.como('00000000-0000-4000-a000-00000000c001');
select testes.deve_bloquear(
  $q$select public.pagar_conta('00000000-0000-4000-a000-00000000c001', '00000000-0000-4000-a200-000000000001', 10)$q$,
  'cadastro pendente não paga conta');

select testes.como('00000000-0000-4000-a000-00000000a001');
select testes.deve_bloquear($q$select * from public.contas_para_avisar('2026-03-10', 9)$q$, 'Ana não vê a lista de avisos');
select testes.deve_bloquear($q$select public.gerar_contas_do_mes()$q$, 'Ana não roda a geração de contas de todos');
select testes.deve_bloquear($q$select public.marcar_contas_avisadas(array['00000000-0000-4000-b000-000000000005']::uuid[], '2026-03-10')$q$, 'Ana não mexe nos avisos');
select testes.deve_bloquear($q$select privado.gerar_contas()$q$, 'Ana não chama a geração interna');

select testes.como_dono_do_banco();
insert into public.despesas_fixas (id, usuario_id, descricao, valor, categoria_id, dia_vencimento, criado_em)
select '00000000-0000-4000-b200-000000000001', '00000000-0000-4000-a000-00000000b001', 'T-Condomínio', 800, id, 31, '2025-12-01'
  from public.categorias where usuario_id = '00000000-0000-4000-a000-00000000b001' and nome = 'Moradia';
select testes.ok(privado.gerar_contas('00000000-0000-4000-b200-000000000001', '2026-02-10') = 2, 'gera o mês atual e o próximo');
select testes.ok(
  (select array_agg(vencimento order by vencimento) from public.contas
    where despesa_fixa_id = '00000000-0000-4000-b200-000000000001' and vencimento < '2026-04-01') = array['2026-02-28', '2026-03-31']::date[],
  'dia 31 em fevereiro vira o último dia do mês');
select testes.ok(privado.gerar_contas('00000000-0000-4000-b200-000000000001', '2026-02-10') = 0, 'rodar de novo não duplica');
update public.contas set status = 'ignorada' where despesa_fixa_id = '00000000-0000-4000-b200-000000000001' and vencimento = '2026-02-28';
select testes.ok(privado.gerar_contas('00000000-0000-4000-b200-000000000001', '2026-02-10') = 0, 'conta ignorada no mês não volta');

insert into public.contas (usuario_id, descricao, valor, categoria_id, vencimento)
select '00000000-0000-4000-a000-00000000b001', d.descricao, 100, c.id, d.venc::date
  from public.categorias c,
       (values ('T-antes', '2026-03-13'), ('T-hoje', '2026-03-10'), ('T-atrasada', '2026-03-08'), ('T-longe', '2026-03-12')) as d(descricao, venc)
 where c.usuario_id = '00000000-0000-4000-a000-00000000b001' and c.nome = 'Contas';

select testes.como_servidor();
select testes.ok(
  (select count(*) from public.contas_para_avisar('2026-03-10', 7) where descricao like 'T-%') = 0,
  'antes das 8h não avisa');
select testes.ok(
  (select array_agg(descricao || ':' || tipo order by descricao) from public.contas_para_avisar('2026-03-10', 9) where descricao like 'T-%')
    = array['T-antes:antes', 'T-atrasada:atrasada', 'T-hoje:hoje'],
  'avisa 3 dias antes, no dia e a atrasada (não a que vence em 2 dias)');
select public.marcar_contas_avisadas(array(select conta_id from public.contas_para_avisar('2026-03-10', 9) where descricao like 'T-%'), '2026-03-10');
select testes.ok((select count(*) from public.contas_para_avisar('2026-03-10', 15) where descricao like 'T-%') = 0, 'não repete no mesmo dia');
select testes.ok(
  (select count(*) from public.contas_para_avisar('2026-03-11', 9) where descricao = 'T-atrasada') = 0
  and (select count(*) from public.contas_para_avisar('2026-03-12', 9) where descricao = 'T-atrasada') = 1,
  'conta atrasada volta a ser avisada a cada 2 dias');
select testes.ok(
  (select tipo from public.contas_para_avisar('2026-03-13', 9) where descricao = 'T-antes') = 'hoje',
  'a que foi avisada antes é avisada de novo no dia');
update public.contas set status = 'ignorada' where descricao = 'T-atrasada';
select testes.ok((select count(*) from public.contas_para_avisar('2026-03-20', 9) where descricao = 'T-atrasada') = 0, 'conta ignorada não é cobrada');
select testes.como_dono_do_banco();
update public.perfis set celular_verificado = false where id = '00000000-0000-4000-a000-00000000b001';
select testes.como_servidor();
select testes.ok((select count(*) from public.contas_para_avisar('2026-03-20', 9) where descricao like 'T-%') = 0, 'sem celular verificado não manda aviso');
select testes.como_dono_do_banco();
update public.perfis set celular_verificado = true where id = '00000000-0000-4000-a000-00000000b001';

-- ---------------------------------------------------------------------
-- 10e. CONSUMO DA IA
-- ---------------------------------------------------------------------
select testes.como_servidor();
insert into public.uso_ia (usuario_id, tipo, modelo, tokens_entrada, tokens_saida, custo_usd) values
  ('00000000-0000-4000-a000-00000000a001', 'conversa', 'gemini-3.1-flash-lite', 1000, 100, 0.0004),
  ('00000000-0000-4000-a000-00000000b001', 'leitura', 'gemini-3.1-flash-lite', 5000, 2000, 0.004),
  (null, 'autoteste', 'gemini-embedding-2', 10, 0, 0.000002);
select testes.como('00000000-0000-4000-a000-00000000a001');
select testes.ok((select count(*) from public.uso_ia) = 1, 'Ana vê só o consumo dela');
select testes.ok((select count(*) from public.resumo_uso_ia('2000-01-01', '2100-01-01')) = 1, 'resumo de consumo da Ana só tem o dela');
select testes.deve_bloquear($q$insert into public.uso_ia (usuario_id, tipo, modelo) values ('00000000-0000-4000-a000-00000000a001', 'conversa', 'x')$q$, 'Ana não grava consumo');
select testes.deve_bloquear($q$delete from public.uso_ia$q$, 'Ana não apaga consumo');
select testes.como('00000000-0000-4000-a000-00000000e001', 'aal1');
select testes.ok((select count(*) from public.uso_ia where usuario_id is distinct from '00000000-0000-4000-a000-00000000e001') = 0, 'admin sem 2FA não vê o consumo dos outros');
select testes.como('00000000-0000-4000-a000-00000000e001', 'aal2');
select testes.ok((select count(*) from public.uso_ia) >= 3, 'admin com 2FA vê o consumo de todos');
select testes.ok((select count(*) from public.resumo_uso_ia('2000-01-01', '2100-01-01')) >= 3, 'resumo do admin com 2FA tem o de todos');
select testes.como_anonimo();
select testes.deve_bloquear('select * from public.uso_ia', 'visitante não vê consumo');
select testes.como_dono_do_banco();

-- ---------------------------------------------------------------------
-- 11. EXCLUIR CONTA (LGPD): apaga tudo da pessoa
-- ---------------------------------------------------------------------
delete from auth.users where id = '00000000-0000-4000-a000-00000000b001';
select testes.ok(
  (select count(*) from public.categorias where usuario_id = '00000000-0000-4000-a000-00000000b001')
  + (select count(*) from public.despesas where usuario_id = '00000000-0000-4000-a000-00000000b001')
  + (select count(*) from public.memorias where usuario_id = '00000000-0000-4000-a000-00000000b001')
  + (select count(*) from public.lembretes where usuario_id = '00000000-0000-4000-a000-00000000b001')
  + (select count(*) from public.documentos where usuario_id = '00000000-0000-4000-a000-00000000b001')
  + (select count(*) from public.decisoes where usuario_id = '00000000-0000-4000-a000-00000000b001')
  + (select count(*) from public.mensagens_conversa where usuario_id = '00000000-0000-4000-a000-00000000b001') = 0,
  'excluir a conta apaga todos os dados da pessoa');

select 'TODOS OS TESTES PASSARAM: ' || current_setting('testes.passou') || ' verificações' as resultado;
