-- Vigias de passagem aérea.
--   * a pessoa pede pelo WhatsApp (ou no site) para vigiar uma rota com um
--     preço-alvo; o robô consulta o Google Flights (pelo SerpApi) algumas
--     vezes por dia e avisa quando o preço fica abaixo do alvo;
--   * datas fixas (ida e, se houver, volta) ou janela flexível
--     ("qualquer saída entre 1 e 20/03, 10 dias de viagem");
--   * cada consulta fica no histórico (para saber se o preço está bom).

create table public.vigias_passagem (
  id                  uuid primary key default gen_random_uuid(),
  usuario_id          uuid not null references public.perfis (id) on delete cascade,
  -- códigos de aeroporto (IATA); vários do mesmo lugar separados por vírgula: GRU,CGH,VCP
  origem              text not null check (origem ~ '^[A-Z]{3}(,[A-Z]{3}){0,5}$'),
  destino             text not null check (destino ~ '^[A-Z]{3}(,[A-Z]{3}){0,5}$'),
  descricao           text check (char_length(descricao) <= 120),    -- "São Paulo → Miami"
  ida                 date not null,                                 -- data de ida (ou início da janela)
  ida_ate             date,                                          -- fim da janela flexível; vazio = ida fixa
  volta               date,                                          -- volta fixa (só com ida fixa)
  dias_viagem         smallint check (dias_viagem between 1 and 60), -- janela flexível de ida e volta
  so_ida              boolean not null default false,
  adultos             smallint not null default 1 check (adultos between 1 and 9),
  so_direto           boolean not null default false,
  preco_alvo          numeric(10, 2) not null check (preco_alvo > 0 and preco_alvo < 1000000),
  ativa               boolean not null default true,
  encerrada_motivo    text check (char_length(encerrada_motivo) <= 120),
  -- preenchido pelo robô
  ultimo_preco        numeric(10, 2),
  ultimo_detalhe      jsonb,
  ultima_busca        timestamptz,
  menor_preco         numeric(10, 2),
  menor_preco_em      timestamptz,
  abaixo_do_alvo      boolean not null default false,
  ultimo_aviso_preco  numeric(10, 2),
  ultimo_aviso_em     timestamptz,
  erro                text check (char_length(erro) <= 300),
  criado_em           timestamptz not null default now(),
  unique (id, usuario_id),
  check (origem <> destino),
  check (ida_ate is null or ida_ate >= ida),
  check (volta is null or volta >= ida),
  check (ida_ate is null or ida_ate <= ida + 120),
  check (
    case
      when so_ida then volta is null and dias_viagem is null
      when ida_ate is null then volta is not null and dias_viagem is null   -- ida e volta, datas fixas
      else volta is null and dias_viagem is not null                         -- ida e volta, janela flexível
    end
  )
);
create index vigias_passagem_usuario on public.vigias_passagem (usuario_id, criado_em);
create index vigias_passagem_fila on public.vigias_passagem (ultima_busca nulls first) where ativa;

alter table public.vigias_passagem enable row level security;
create policy dono_ver on public.vigias_passagem for select to authenticated
  using (usuario_id = (select auth.uid()) and (select privado.usuario_aprovado()));
create policy dono_criar on public.vigias_passagem for insert to authenticated
  with check (usuario_id = (select auth.uid()) and (select privado.usuario_aprovado()));
create policy dono_editar on public.vigias_passagem for update to authenticated
  using (usuario_id = (select auth.uid()) and (select privado.usuario_aprovado()))
  with check (usuario_id = (select auth.uid()) and (select privado.usuario_aprovado()));
create policy dono_apagar on public.vigias_passagem for delete to authenticated
  using (usuario_id = (select auth.uid()) and (select privado.usuario_aprovado()));
revoke all on public.vigias_passagem from anon, authenticated;
grant select, delete on public.vigias_passagem to authenticated;
grant insert (id, usuario_id, origem, destino, descricao, ida, ida_ate, volta, dias_viagem, so_ida, adultos, so_direto, preco_alvo)
  on public.vigias_passagem to authenticated;
-- a pessoa só pausa/reativa e muda o alvo; o resto é do robô
grant update (ativa, preco_alvo) on public.vigias_passagem to authenticated;

-- Até 10 vigias ativas por pessoa (cada uma gasta buscas da cota mensal).
-- Reativar ou mudar o alvo zera o estado de aviso; data que já passou não reativa.
create function privado.vigia_passagem_regras() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.ativa and (tg_op = 'INSERT' or not old.ativa) then
    if coalesce(new.ida_ate, new.ida) < privado.hoje_sp() then
      raise exception 'a data da viagem já passou';
    end if;
    if (select count(*) from public.vigias_passagem
         where usuario_id = new.usuario_id and ativa and id <> new.id) >= 10 then
      raise exception 'limite de 10 vigias ativas';
    end if;
  end if;
  if tg_op = 'UPDATE' then
    if new.ativa and not old.ativa then
      new.encerrada_motivo := null;
      new.abaixo_do_alvo := false;
      new.ultimo_aviso_preco := null;
    end if;
    if new.preco_alvo is distinct from old.preco_alvo then
      new.abaixo_do_alvo := false;
      new.ultimo_aviso_preco := null;
    end if;
  end if;
  return new;
end $$;
revoke all on function privado.vigia_passagem_regras() from public, anon, authenticated;
create trigger vigia_passagem_regras before insert or update on public.vigias_passagem
  for each row execute function privado.vigia_passagem_regras();

-- ---------------------------------------------------------------------
-- HISTÓRICO DE PREÇOS (o robô grava; a pessoa só vê)
-- ---------------------------------------------------------------------
create table public.precos_passagem (
  id          bigint generated always as identity primary key,
  vigia_id    uuid not null,
  usuario_id  uuid not null,
  buscado_em  timestamptz not null default now(),
  preco       numeric(10, 2),            -- vazio = a busca não achou voo
  detalhe     jsonb,
  foreign key (vigia_id, usuario_id) references public.vigias_passagem (id, usuario_id) on delete cascade
);
create index precos_passagem_vigia on public.precos_passagem (vigia_id, buscado_em desc);
create index precos_passagem_dia on public.precos_passagem (buscado_em);
create index precos_passagem_usuario on public.precos_passagem (usuario_id);

alter table public.precos_passagem enable row level security;
create policy dono_ver on public.precos_passagem for select to authenticated
  using (usuario_id = (select auth.uid()) and (select privado.usuario_aprovado()));
revoke all on public.precos_passagem from anon, authenticated;
grant select on public.precos_passagem to authenticated;

-- ---------------------------------------------------------------------
-- Funções da rotina (só o robô)
-- ---------------------------------------------------------------------
-- Quantas buscas das vigias já foram feitas hoje (todas as pessoas: a cota é uma só).
create function public.buscas_de_vigia_hoje() returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.precos_passagem
   where buscado_em >= ((privado.hoje_sp())::timestamp at time zone 'America/Sao_Paulo')
$$;

-- Vigias da vez: ativas, de quem está aprovado e com celular verificado,
-- sem busca nas últimas p_intervalo_horas, as mais antigas primeiro.
create function public.vigias_para_checar(p_limite integer, p_intervalo_horas integer default 12)
returns table (id uuid, usuario_id uuid, celular text)
language sql stable security definer set search_path = '' as $$
  select v.id, v.usuario_id, p.celular
    from public.vigias_passagem v
    join public.perfis p on p.id = v.usuario_id
   where v.ativa
     and p.status = 'aprovado' and p.celular_verificado and p.celular is not null
     and coalesce(v.ida_ate, v.ida) >= privado.hoje_sp()
     and (v.ultima_busca is null or v.ultima_busca < now() - make_interval(hours => p_intervalo_horas))
   order by v.ultima_busca nulls first, v.criado_em
   limit greatest(0, least(p_limite, 50))
$$;

-- Encerra as vigias cuja data já passou e apaga histórico com mais de 1 ano.
create function public.encerrar_vigias_vencidas() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  update public.vigias_passagem
     set ativa = false, encerrada_motivo = 'a data da viagem passou'
   where ativa and coalesce(ida_ate, ida) < privado.hoje_sp();
  get diagnostics n = row_count;
  delete from public.precos_passagem where buscado_em < now() - interval '400 days';
  return n;
end $$;

revoke all on function public.buscas_de_vigia_hoje() from public, anon, authenticated;
revoke all on function public.vigias_para_checar(integer, integer) from public, anon, authenticated;
revoke all on function public.encerrar_vigias_vencidas() from public, anon, authenticated;
grant execute on function public.buscas_de_vigia_hoje() to service_role;
grant execute on function public.vigias_para_checar(integer, integer) to service_role;
grant execute on function public.encerrar_vigias_vencidas() to service_role;
