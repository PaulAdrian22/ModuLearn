-- Admin-side schema extensions:
--   * Soft-delete on modules (used by AdminLessons "recycle bin" UI)
--   * Reports table (used by ModuleView "report issue" + AdminDashboard reports list)

-- ============================================================
-- modules: soft-delete columns
-- ============================================================
alter table public.modules
    add column if not exists is_deleted boolean not null default false,
    add column if not exists deleted_at timestamptz;

create index if not exists idx_modules_is_deleted on public.modules(is_deleted);

-- ============================================================
-- reports
-- ============================================================
create table if not exists public.reports (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid references public.profiles(id) on delete set null,
    module_id     uuid references public.modules(id) on delete set null,
    section_id    text,
    category      text,
    message       text not null,
    status        text not null default 'open'
                  check (status in ('open', 'resolved', 'dismissed')),
    resolved_by   uuid references public.profiles(id) on delete set null,
    resolved_at   timestamptz,
    created_at    timestamptz not null default now()
);
create index if not exists idx_reports_status   on public.reports(status);
create index if not exists idx_reports_user     on public.reports(user_id);
create index if not exists idx_reports_created  on public.reports(created_at desc);

alter table public.reports enable row level security;

-- Anyone signed in can file a report (only for themselves).
create policy "reports: self insert"
    on public.reports for insert
    to authenticated
    with check (auth.uid() = user_id);

-- Authors can read their own reports.
create policy "reports: self read"
    on public.reports for select
    using (auth.uid() = user_id);

-- Admins can read/update/delete everything.
create policy "reports: admin all"
    on public.reports for all
    using (public.is_admin(auth.uid()))
    with check (public.is_admin(auth.uid()));
