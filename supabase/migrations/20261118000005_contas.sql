-- Etapa 7: contas a pagar.
--   * despesas_fixas viram "contas fixas": o robô cria a conta de cada mês
--     sozinho (o valor pode ficar em branco nas contas variáveis, como luz);
--   * contas avulsas (boleto, IPVA, parcela) também entram na lista;
--   * pagar uma conta já lança o gasto em despesas (sem lançar duas vezes);
--   * o robô avisa antes, no dia e, depois de vencida, a cada N dias.

-- "Hoje" no horário de Brasília
create function privado.hoje_sp() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;
grant execute on function privado.hoje_sp() to authenticated, service_role;

-- Dia de vencimento dentro do mês (dia 31 em fevereiro vira o último dia)
create function privado.vencimento_no_mes(p_mes date, p_dia integer) returns date
language sql immutable set search_path = '' as $$
  select make_date(extract(year from p_mes)::int, extract(month from p_mes)::int,
                   least(p_dia, extract(day from (date_trunc('month', p_mes) + interval '1 month - 1 day'))::int))
$$;
grant execute on function privado.vencimento_no_mes(date, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Contas fixas: valor pode ficar em branco (conta variável)
-- ---------------------------------------------------------------------
alter table public.despesas_fixas alter column valor drop not null;

-- Preferências de aviso (a pessoa pode mudar no site)
alter table public.perfis
  add column contas_aviso_dias_antes  smallint not null default 3 check (contas_aviso_dias_antes between 0 and 10),
  add column contas_aviso_atraso_cada smallint not null default 2 check (contas_aviso_atraso_cada between 1 and 7),
  add column contas_aviso_hora        smallint not null default 8 check (contas_aviso_hora between 6 and 20);
grant update (contas_aviso_dias_antes, contas_aviso_atraso_cada, contas_aviso_hora) on public.perfis to authenticated;

alter table public.despesas add constraint despesas_id_usuario unique (id, usuario_id);

-- ---------------------------------------------------------------------
-- CONTAS
-- ---------------------------------------------------------------------
create table public.contas (
  id               uuid primary key default gen_random_uuid(),
  usuario_id       uuid not null references public.perfis (id) on delete cascade,
  descricao        text not null check (char_length(btrim(descricao)) between 1 and 200),
  valor            numeric(12, 2) check (valor > 0),               -- em branco = "a definir"
  categoria_id     uuid not null,
  vencimento       date not null,
  despesa_fixa_id  uuid,
  status           text not null default 'a_pagar' check (status in ('a_pagar', 'paga', 'ignorada')),
  paga_em          date,
  despesa_id       uuid,                                            -- o gasto lançado ao pagar
  origem           text not null default 'site' check (origem in ('site', 'whatsapp', 'fixa')),
  ultimo_aviso_em  date,
  criado_em        timestamptz not null default now(),
  -- tudo precisa ser da MESMA pessoa
  foreign key (categoria_id, usuario_id) references public.categorias (id, usuario_id),
  foreign key (despesa_fixa_id, usuario_id) references public.despesas_fixas (id, usuario_id) on delete set null (despesa_fixa_id),
  foreign key (despesa_id, usuario_id) references public.despesas (id, usuario_id) on delete set null (despesa_id),
  check ((status = 'paga') = (paga_em is not null))
);
create index contas_usuario_vencimento on public.contas (usuario_id, vencimento);
create index contas_a_pagar on public.contas (vencimento) where status = 'a_pagar';
create index contas_categoria on public.contas (categoria_id, usuario_id);
create index contas_despesa on public.contas (despesa_id) where despesa_id is not null;
-- uma conta por mês para cada conta fixa
create unique index contas_fixa_uma_por_mes
  on public.contas (despesa_fixa_id, date_trunc('month', vencimento::timestamp))
  where despesa_fixa_id is not null;

alter table public.contas enable row level security;
create policy dono_ver on public.contas for select to authenticated
  using (usuario_id = (select auth.uid()) and (select privado.usuario_aprovado()));
create policy dono_criar on public.contas for insert to authenticated
  with check (usuario_id = (select auth.uid()) and (select privado.usuario_aprovado()));
create policy dono_editar on public.contas for update to authenticated
  using (usuario_id = (select auth.uid()) and (select privado.usuario_aprovado()))
  with check (usuario_id = (select auth.uid()) and (select privado.usuario_aprovado()));
create policy dono_apagar on public.contas for delete to authenticated
  using (usuario_id = (select auth.uid()) and (select privado.usuario_aprovado()));
revoke all on public.contas from anon;
revoke insert, update, truncate, references, trigger on public.contas from authenticated;
grant insert (id, usuario_id, descricao, valor, categoria_id, vencimento) on public.contas to authenticated;
-- pagar/desfazer passa pelas funções abaixo; aqui só o que a pessoa edita
grant update (descricao, valor, categoria_id, vencimento, status) on public.contas to authenticated;

-- A pessoa só pode marcar "ignorada" ou voltar para "a pagar" pela edição
-- direta; "paga" só pela função pagar_conta (que lança o gasto).
create function privado.conta_status_valido() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and new.status is distinct from old.status then
    if new.status = 'paga' or old.status = 'paga' then
      raise exception 'use pagar_conta / reabrir_conta';
    end if;
  end if;
  return new;
end $$;
create trigger conta_status_valido before update on public.contas
  for each row execute function privado.conta_status_valido();

-- ---------------------------------------------------------------------
-- Gerar as contas do mês a partir das contas fixas
-- ---------------------------------------------------------------------
-- Cria a conta do mês atual e do próximo para cada conta fixa ativa
-- (nunca antes de a conta fixa existir). Não recria uma conta já ignorada.
create function privado.gerar_contas(p_fixa uuid default null, p_hoje date default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  hoje date := coalesce(p_hoje, privado.hoje_sp());
  n integer;
begin
  insert into public.contas (usuario_id, descricao, valor, categoria_id, vencimento, despesa_fixa_id, origem)
  select f.usuario_id, f.descricao, f.valor, f.categoria_id,
         privado.vencimento_no_mes(m.mes, f.dia_vencimento), f.id, 'fixa'
    from public.despesas_fixas f
    join public.perfis p on p.id = f.usuario_id and p.status = 'aprovado'
   cross join (values (date_trunc('month', hoje)::date),
                      ((date_trunc('month', hoje) + interval '1 month')::date)) as m(mes)
   where f.ativa
     and (p_fixa is null or f.id = p_fixa)
     and privado.vencimento_no_mes(m.mes, f.dia_vencimento) >= (f.criado_em at time zone 'America/Sao_Paulo')::date
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function privado.gerar_contas(uuid, date) from public, anon, authenticated;

-- Rotina diária do robô
create function public.gerar_contas_do_mes(p_hoje date default null) returns integer
language sql security definer set search_path = '' as $$
  select privado.gerar_contas(null, p_hoje)
$$;
revoke all on function public.gerar_contas_do_mes(date) from public, anon, authenticated;
grant execute on function public.gerar_contas_do_mes(date) to service_role;

-- Mudou a conta fixa: as contas ainda não pagas (de hoje em diante) acompanham;
-- pausou ou apagou: as futuras não pagas saem; criou/reativou: gera as do mês.
create function privado.fixa_mudou() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  hoje date := privado.hoje_sp();
begin
  if tg_op = 'DELETE' then
    delete from public.contas where despesa_fixa_id = old.id and status = 'a_pagar' and vencimento >= hoje;
    return old;
  end if;
  if tg_op = 'UPDATE' then
    if not new.ativa then
      delete from public.contas where despesa_fixa_id = new.id and status = 'a_pagar' and vencimento >= hoje;
      return new;
    end if;
    update public.contas c
       set descricao = new.descricao,
           categoria_id = new.categoria_id,
           -- valor do mês que a pessoa já ajustou ("a luz deu 287") é mantido
           valor = case when c.valor is not distinct from old.valor then new.valor else c.valor end,
           vencimento = privado.vencimento_no_mes(c.vencimento, new.dia_vencimento)
     where c.despesa_fixa_id = new.id and c.status = 'a_pagar' and c.vencimento >= hoje;
  end if;
  perform privado.gerar_contas(new.id, hoje);
  return new;
end $$;
revoke all on function privado.fixa_mudou() from public, anon, authenticated;

create trigger fixa_mudou_antes_de_apagar before delete on public.despesas_fixas
  for each row execute function privado.fixa_mudou();
create trigger fixa_mudou after insert or update on public.despesas_fixas
  for each row execute function privado.fixa_mudou();

-- Apagou o gasto de uma conta paga: a conta volta a ficar "a pagar".
create function privado.despesa_de_conta_apagada() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.contas set status = 'a_pagar', paga_em = null, despesa_id = null
   where despesa_id = old.id;
  return old;
end $$;
revoke all on function privado.despesa_de_conta_apagada() from public, anon, authenticated;
create trigger despesa_de_conta_apagada before delete on public.despesas
  for each row execute function privado.despesa_de_conta_apagada();

-- ---------------------------------------------------------------------
-- Pagar / desfazer pagamento (site e robô usam as mesmas funções)
-- ---------------------------------------------------------------------
create function public.pagar_conta(
  p_usuario uuid, p_conta uuid, p_valor numeric default null, p_data date default null, p_origem text default 'site'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  c public.contas;
  v numeric(12, 2);
  d date;
  nova uuid;
begin
  -- logado: só a própria pessoa, aprovada. Servidor (sem login): informa a pessoa.
  if auth.uid() is not null and (auth.uid() <> p_usuario or not privado.usuario_aprovado()) then
    raise exception 'acesso negado';
  end if;
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'acesso negado';
  end if;

  select * into c from public.contas where id = p_conta and usuario_id = p_usuario for update;
  if not found then raise exception 'conta não encontrada'; end if;
  if c.status = 'paga' then return c.despesa_id; end if;

  v := coalesce(p_valor, c.valor);
  if v is null or v <= 0 then raise exception 'falta o valor'; end if;
  d := coalesce(p_data, privado.hoje_sp());
  if d > privado.hoje_sp() + 1 or d < privado.hoje_sp() - 400 then raise exception 'data inválida'; end if;

  insert into public.despesas (usuario_id, valor, categoria_id, descricao, data, origem)
  values (p_usuario, v, c.categoria_id, left(c.descricao, 200), d,
          case when p_origem = 'whatsapp' then 'whatsapp' else 'site' end)
  returning id into nova;

  update public.contas set status = 'paga', paga_em = d, valor = v, despesa_id = nova where id = c.id;
  return nova;
end $$;

create function public.reabrir_conta(p_usuario uuid, p_conta uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.contas;
begin
  if auth.uid() is not null and (auth.uid() <> p_usuario or not privado.usuario_aprovado()) then
    raise exception 'acesso negado';
  end if;
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'acesso negado';
  end if;
  select * into c from public.contas where id = p_conta and usuario_id = p_usuario for update;
  if not found then raise exception 'conta não encontrada'; end if;
  if c.despesa_id is not null then
    delete from public.despesas where id = c.despesa_id and usuario_id = p_usuario;  -- o gatilho reabre a conta
  end if;
  update public.contas set status = 'a_pagar', paga_em = null, despesa_id = null where id = c.id;
end $$;

revoke all on function public.pagar_conta(uuid, uuid, numeric, date, text) from public, anon;
revoke all on function public.reabrir_conta(uuid, uuid) from public, anon;
grant execute on function public.pagar_conta(uuid, uuid, numeric, date, text) to authenticated, service_role;
grant execute on function public.reabrir_conta(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Avisos (só o robô)
-- ---------------------------------------------------------------------
create function public.contas_para_avisar(p_hoje date, p_hora integer)
returns table (usuario_id uuid, celular text, nome text, conta_id uuid, descricao text,
               valor numeric, vencimento date, tipo text)
language sql stable security definer set search_path = '' as $$
  select c.usuario_id, p.celular, p.nome, c.id, c.descricao, c.valor, c.vencimento,
         case when c.vencimento < p_hoje then 'atrasada'
              when c.vencimento = p_hoje then 'hoje'
              else 'antes' end
    from public.contas c
    join public.perfis p on p.id = c.usuario_id
   where c.status = 'a_pagar'
     and p.status = 'aprovado' and p.celular_verificado and p.celular is not null
     and p_hora >= p.contas_aviso_hora
     and (c.ultimo_aviso_em is null or c.ultimo_aviso_em < p_hoje)
     and (
           c.vencimento = p_hoje
        or (p.contas_aviso_dias_antes > 0 and c.vencimento = p_hoje + p.contas_aviso_dias_antes)
        or (c.vencimento < p_hoje
            and (c.ultimo_aviso_em is null or c.ultimo_aviso_em <= p_hoje - p.contas_aviso_atraso_cada))
     )
   order by c.usuario_id, c.vencimento, c.descricao
$$;

create function public.marcar_contas_avisadas(p_contas uuid[], p_hoje date) returns void
language sql security definer set search_path = '' as $$
  update public.contas set ultimo_aviso_em = p_hoje where id = any (p_contas)
$$;

revoke all on function public.contas_para_avisar(date, integer) from public, anon, authenticated;
revoke all on function public.marcar_contas_avisadas(uuid[], date) from public, anon, authenticated;
grant execute on function public.contas_para_avisar(date, integer) to service_role;
grant execute on function public.marcar_contas_avisadas(uuid[], date) to service_role;

-- Contas fixas que já existem: gera as contas deste mês e do próximo
select privado.gerar_contas();
