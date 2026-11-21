-- Respostas em áudio: o robô pode responder com mensagem de voz (voz do Gemini).
--   nunca        = sempre por escrito
--   quando_audio = áudio quando a pessoa mandou áudio (padrão)
--   sempre       = sempre em áudio
alter table public.perfis
  add column respostas_em_audio text not null default 'quando_audio'
    check (respostas_em_audio in ('nunca', 'quando_audio', 'sempre'));
grant update (respostas_em_audio) on public.perfis to authenticated;

-- Consumo da IA ganha o tipo "voz"
alter table public.uso_ia drop constraint uso_ia_tipo_check;
alter table public.uso_ia add constraint uso_ia_tipo_check
  check (tipo in ('conversa', 'audio', 'leitura', 'resumo', 'vetores', 'pergunta', 'autoteste', 'email', 'voz'));
