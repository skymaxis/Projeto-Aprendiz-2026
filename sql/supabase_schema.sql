create extension if not exists "pgcrypto";

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  codigo integer,
  nome text not null,
  email text,
  email_formulario text,
  ddd text,
  telefone text,
  telefone_internacional text,
  whatsapp_url text,
  igreja text,
  regiao text,
  pastor_nome text,
  pastor_telefone text,
  instrumento text,
  data_inscricao text,
  hora_inscricao text,
  data_nascimento date,
  idade integer,
  faixa_etaria text,
  status text,
  observacoes text,
  foto_url text,
  documentos jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  igreja text,
  capacidade integer default 0,
  inscritos jsonb default '[]'::jsonb,
  status text,
  descricao text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  turma_id uuid references public.classes(id) on delete set null,
  titulo text not null,
  data date,
  hora_inicio text,
  hora_fim text,
  local text,
  descricao text,
  status text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.students(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  lesson_id uuid references public.lessons(id) on delete set null,
  date date,
  status text,
  justification text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.allowed_users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  status text default 'ativo',
  modules jsonb not null default '{"students":"viewer","classes":"viewer","lessons":"viewer","attendance":"viewer","dashboard":"viewer","permissions":"viewer"}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.students enable row level security;
alter table public.classes enable row level security;
alter table public.lessons enable row level security;
alter table public.attendance enable row level security;
alter table public.allowed_users enable row level security;

create or replace function public.user_is_allowed(user_email text)
returns boolean
language sql
security definer
as $$
  select exists (
    select 1
    from public.allowed_users
    where lower(email) = lower(user_email)
      and status = 'ativo'
  );
$$;

create policy if not exists "allowed users can read students"
on public.students for select
using (public.user_is_allowed(auth.email()));

create policy if not exists "allowed users can write students"
on public.students for all
using (public.user_is_allowed(auth.email()))
with check (public.user_is_allowed(auth.email()));

create policy if not exists "allowed users can read classes"
on public.classes for select
using (public.user_is_allowed(auth.email()));

create policy if not exists "allowed users can write classes"
on public.classes for all
using (public.user_is_allowed(auth.email()))
with check (public.user_is_allowed(auth.email()));

create policy if not exists "allowed users can read lessons"
on public.lessons for select
using (public.user_is_allowed(auth.email()));

create policy if not exists "allowed users can write lessons"
on public.lessons for all
using (public.user_is_allowed(auth.email()))
with check (public.user_is_allowed(auth.email()));

create policy if not exists "allowed users can read attendance"
on public.attendance for select
using (public.user_is_allowed(auth.email()));

create policy if not exists "allowed users can write attendance"
on public.attendance for all
using (public.user_is_allowed(auth.email()))
with check (public.user_is_allowed(auth.email()));

create policy if not exists "allowed users can read allowed_users"
on public.allowed_users for select
using (public.user_is_allowed(auth.email()));

create policy if not exists "allowed users can write allowed_users"
on public.allowed_users for all
using (public.user_is_allowed(auth.email()))
with check (public.user_is_allowed(auth.email()));
