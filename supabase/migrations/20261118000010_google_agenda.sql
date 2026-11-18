-- Agenda pelo login do Google (ler e criar compromissos).
alter table public.conexoes drop constraint conexoes_tipo_check;
alter table public.conexoes add constraint conexoes_tipo_check check (tipo in ('gmail', 'agenda_ics', 'google_calendar'));
