-- Imitação mínima do Supabase para rodar os testes num Postgres comum
-- (papéis anon/authenticated/service_role, auth.users, auth.uid(), storage).
-- Usado SÓ nos testes locais; no Supabase de verdade isso já existe.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text,
  raw_user_meta_data  jsonb default '{}'::jsonb,
  email_confirmed_at  timestamptz,
  created_at          timestamptz default now()
);

create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;

create schema storage;
grant usage on schema storage to anon, authenticated, service_role;

create table storage.buckets (
  id               text primary key,
  name             text not null,
  public           boolean default false,
  file_size_limit  bigint
);
create table storage.objects (
  id          uuid primary key default gen_random_uuid(),
  bucket_id   text references storage.buckets (id),
  name        text,
  created_at  timestamptz default now()
);
alter table storage.objects enable row level security;
grant all on storage.objects to authenticated, service_role;
grant select on storage.buckets to authenticated, service_role;

create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
