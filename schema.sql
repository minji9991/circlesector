-- Supabase SQL Editor에서 실행하세요. 익명 학생 접근을 위한 최소 권한 정책입니다.
create table if not exists public.circle_students (
 id uuid primary key default gen_random_uuid(), class_no int not null check(class_no between 1 and 20),
 student_no int not null check(student_no between 1 and 50), name text not null,
 created_at timestamptz not null default now(), last_seen timestamptz not null default now(),
 unique(class_no, student_no)
);
create table if not exists public.circle_progress (
 student_id uuid primary key references public.circle_students(id) on delete cascade,
 stage int not null default 1, answers jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now()
);
create table if not exists public.circle_session_events (
 id bigint generated always as identity primary key, student_id uuid not null references public.circle_students(id) on delete cascade,
 event_type text not null, occurred_at timestamptz not null default now()
);
create index if not exists circle_session_events_student_time on public.circle_session_events(student_id, occurred_at desc);
create table if not exists public.circle_class_control (
 class_no int primary key check(class_no between 1 and 20), unlocked_stage int not null default 1,
 updated_at timestamptz not null default now()
);
insert into public.circle_class_control(class_no) select generate_series(1,20) on conflict do nothing;
-- 중요: 학생이 교사 권한을 흉내내지 못하도록 교사 기능은 Edge Function으로 분리합니다.
alter table public.circle_students enable row level security;
alter table public.circle_progress enable row level security;
alter table public.circle_session_events enable row level security;
alter table public.circle_class_control enable row level security;
-- 이 버전은 학생 개인정보 보호를 위해 직접 DB 접근을 허용하지 않습니다.
-- Edge Function이 service_role로 검증 후 읽고 씁니다.
