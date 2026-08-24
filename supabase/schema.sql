-- ---------------------------------------------------------------------------
-- pgcanvas: armazenamento dos modelos por usuário
--
-- Rode este arquivo inteiro no SQL Editor do seu projeto Supabase.
-- Ele é idempotente: pode rodar de novo sem quebrar nada.
--
-- A segurança aqui é o RLS. A chave que vai para o navegador (anon/publishable)
-- só consegue o que estas políticas permitem, e elas restringem tudo ao dono
-- da linha. Nunca coloque a chave service_role no front, ela ignora o RLS.
-- ---------------------------------------------------------------------------

create extension if not exists pgcrypto;

create table if not exists public.pgcanvas_diagrams (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null default auth.uid()
                          references auth.users (id) on delete cascade,
  name        text        not null,
  data        jsonb       not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint pgcanvas_diagrams_name_len check (char_length(name) between 1 and 120),
  -- trava simples de tamanho, para uma conta não virar depósito de arquivo
  constraint pgcanvas_diagrams_data_size check (pg_column_size(data) <= 2097152)
);

comment on table public.pgcanvas_diagrams is 'Modelos de dados salvos pelo pgcanvas, um por linha';
comment on column public.pgcanvas_diagrams.data is 'Diagrama serializado: tabelas, colunas e relacionamentos';

create index if not exists pgcanvas_diagrams_user_updated_idx
  on public.pgcanvas_diagrams (user_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- updated_at sempre certo, mesmo se o cliente esquecer de mandar
-- ---------------------------------------------------------------------------

create or replace function public.pgcanvas_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  new.user_id = old.user_id;   -- ninguém transfere linha para outro dono
  return new;
end;
$$;

drop trigger if exists pgcanvas_diagrams_touch on public.pgcanvas_diagrams;
create trigger pgcanvas_diagrams_touch
  before update on public.pgcanvas_diagrams
  for each row execute function public.pgcanvas_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security: cada pessoa enxerga e mexe apenas no que é dela
-- ---------------------------------------------------------------------------

alter table public.pgcanvas_diagrams enable row level security;

drop policy if exists "pgcanvas: ler os próprios modelos"     on public.pgcanvas_diagrams;
drop policy if exists "pgcanvas: criar modelo próprio"        on public.pgcanvas_diagrams;
drop policy if exists "pgcanvas: alterar o próprio modelo"    on public.pgcanvas_diagrams;
drop policy if exists "pgcanvas: apagar o próprio modelo"     on public.pgcanvas_diagrams;

create policy "pgcanvas: ler os próprios modelos"
  on public.pgcanvas_diagrams
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "pgcanvas: criar modelo próprio"
  on public.pgcanvas_diagrams
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "pgcanvas: alterar o próprio modelo"
  on public.pgcanvas_diagrams
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "pgcanvas: apagar o próprio modelo"
  on public.pgcanvas_diagrams
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- visitante anônimo não tem nada aqui
revoke all on public.pgcanvas_diagrams from anon;
grant select, insert, update, delete on public.pgcanvas_diagrams to authenticated;

-- ---------------------------------------------------------------------------
-- Conferência rápida: as quatro políticas precisam aparecer
-- ---------------------------------------------------------------------------
-- select policyname, cmd from pg_policies where tablename = 'pgcanvas_diagrams';
