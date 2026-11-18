-- Consumo da IA: cada chamada ao Gemini registra tokens e custo estimado.
-- Quem grava é só o robô; cada pessoa vê o próprio consumo e o
-- administrador (com 2FA) vê o de todos.

create table public.uso_ia (
  id              bigint generated always as identity primary key,
  criado_em       timestamptz not null default now(),
  dia             date not null default privado.hoje_sp(),
  usuario_id      uuid references public.perfis (id) on delete cascade,   -- vazio = uso do sistema (autoteste)
  tipo            text not null check (tipo in ('conversa', 'audio', 'leitura', 'resumo', 'vetores', 'pergunta', 'autoteste')),
  modelo          text not null check (char_length(modelo) <= 60),
  chamadas        integer not null default 1 check (chamadas >= 0),
  tokens_entrada  bigint not null default 0 check (tokens_entrada >= 0),
  tokens_saida    bigint not null default 0 check (tokens_saida >= 0),
  custo_usd       numeric(12, 6) not null default 0 check (custo_usd >= 0)
);
create index uso_ia_dia on public.uso_ia (dia);
create index uso_ia_usuario_dia on public.uso_ia (usuario_id, dia);

alter table public.uso_ia enable row level security;
create policy uso_ver on public.uso_ia for select to authenticated
  using (
    (usuario_id = (select auth.uid()) and (select privado.usuario_aprovado()))
    or (select privado.eh_admin_com_2fa())
  );
revoke all on public.uso_ia from anon;
revoke insert, update, delete, truncate, references, trigger on public.uso_ia from authenticated;
