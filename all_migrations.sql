
-- Roles
create type public.app_role as enum ('admin','manager','staff');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique(user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.user_roles where user_id=_user_id and role=_role);
$$;

create or replace function public.is_admin_or_manager(_user_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.user_roles where user_id=_user_id and role in ('admin','manager'));
$$;

-- Auto profile creation
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  -- First user becomes admin
  if (select count(*) from public.user_roles) = 0 then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  else
    insert into public.user_roles (user_id, role) values (new.id, 'staff');
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Categories
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now()
);
alter table public.categories enable row level security;

-- Locations
create table public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  address text,
  created_at timestamptz not null default now()
);
alter table public.locations enable row level security;

-- Assets
create type public.asset_status as enum ('in_use','in_storage','under_repair','retired');

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  asset_tag text not null unique,
  name text not null,
  description text,
  category_id uuid references public.categories(id) on delete set null,
  location_id uuid references public.locations(id) on delete set null,
  status public.asset_status not null default 'in_storage',
  purchase_value numeric(12,2),
  purchase_date date,
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.assets enable row level security;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger assets_updated_at before update on public.assets
  for each row execute function public.touch_updated_at();

-- RLS policies
-- profiles
create policy "auth read profiles" on public.profiles for select to authenticated using (true);
create policy "users update own profile" on public.profiles for update to authenticated using (auth.uid()=id);
create policy "admins update any profile" on public.profiles for update to authenticated using (public.has_role(auth.uid(),'admin'));

-- user_roles
create policy "auth read roles" on public.user_roles for select to authenticated using (true);
create policy "admins manage roles" on public.user_roles for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- categories
create policy "auth read categories" on public.categories for select to authenticated using (true);
create policy "mgr write categories" on public.categories for all to authenticated
  using (public.is_admin_or_manager(auth.uid())) with check (public.is_admin_or_manager(auth.uid()));

-- locations
create policy "auth read locations" on public.locations for select to authenticated using (true);
create policy "mgr write locations" on public.locations for all to authenticated
  using (public.is_admin_or_manager(auth.uid())) with check (public.is_admin_or_manager(auth.uid()));

-- assets
create policy "auth read assets" on public.assets for select to authenticated using (true);
create policy "mgr write assets" on public.assets for all to authenticated
  using (public.is_admin_or_manager(auth.uid())) with check (public.is_admin_or_manager(auth.uid()));

alter function public.touch_updated_at() set search_path = public;

revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
revoke execute on function public.is_admin_or_manager(uuid) from public, anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;

-- 1. Sub-categories
ALTER TABLE public.categories
  ADD COLUMN parent_id uuid REFERENCES public.categories(id) ON DELETE SET NULL;

-- 2. Extend asset_status enum
ALTER TYPE public.asset_status ADD VALUE IF NOT EXISTS 'lost';
ALTER TYPE public.asset_status ADD VALUE IF NOT EXISTS 'disposed';

-- 3. Asset assignments / custody
CREATE TABLE public.asset_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  assigned_to_user uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to_name text,
  department text,
  assignment_date date NOT NULL DEFAULT CURRENT_DATE,
  return_date date,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.asset_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read assignments" ON public.asset_assignments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "mgr write assignments" ON public.asset_assignments
  FOR ALL TO authenticated
  USING (public.is_admin_or_manager(auth.uid()))
  WITH CHECK (public.is_admin_or_manager(auth.uid()));
CREATE INDEX idx_asset_assignments_asset ON public.asset_assignments(asset_id);

-- 4. Asset movement history
CREATE TABLE public.asset_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  from_location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  to_location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  moved_at date NOT NULL DEFAULT CURRENT_DATE,
  moved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.asset_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read movements" ON public.asset_movements
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "mgr write movements" ON public.asset_movements
  FOR ALL TO authenticated
  USING (public.is_admin_or_manager(auth.uid()))
  WITH CHECK (public.is_admin_or_manager(auth.uid()));
CREATE INDEX idx_asset_movements_asset ON public.asset_movements(asset_id);

-- 5. Asset attachments
CREATE TABLE public.asset_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('invoice','receipt','warranty','image','other')),
  file_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.asset_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read attachments" ON public.asset_attachments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "mgr write attachments" ON public.asset_attachments
  FOR ALL TO authenticated
  USING (public.is_admin_or_manager(auth.uid()))
  WITH CHECK (public.is_admin_or_manager(auth.uid()));
CREATE INDEX idx_asset_attachments_asset ON public.asset_attachments(asset_id);

-- 6. Asset disposal records
CREATE TABLE public.asset_disposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  disposal_reason text NOT NULL,
  disposal_date date NOT NULL DEFAULT CURRENT_DATE,
  disposal_value numeric,
  approval_notes text,
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.asset_disposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read disposals" ON public.asset_disposals
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "mgr write disposals" ON public.asset_disposals
  FOR ALL TO authenticated
  USING (public.is_admin_or_manager(auth.uid()))
  WITH CHECK (public.is_admin_or_manager(auth.uid()));
CREATE INDEX idx_asset_disposals_asset ON public.asset_disposals(asset_id);

-- 7. Storage bucket for attachments (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('asset-files','asset-files', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "auth read asset-files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'asset-files');

CREATE POLICY "mgr insert asset-files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'asset-files' AND public.is_admin_or_manager(auth.uid()));

CREATE POLICY "mgr update asset-files" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'asset-files' AND public.is_admin_or_manager(auth.uid()));

CREATE POLICY "mgr delete asset-files" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'asset-files' AND public.is_admin_or_manager(auth.uid()));
ALTER TABLE public.asset_disposals
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

ALTER TABLE public.asset_disposals
  DROP CONSTRAINT IF EXISTS asset_disposals_status_check;
ALTER TABLE public.asset_disposals
  ADD CONSTRAINT asset_disposals_status_check
  CHECK (status IN ('pending','approved','rejected'));
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS locations_parent_id_idx ON public.locations(parent_id);

-- BRANCHES
create table public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  address text,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.branches enable row level security;
create policy "auth read branches" on public.branches for select to authenticated using (true);
create policy "admin insert branches" on public.branches for insert to authenticated with check (has_role(auth.uid(),'admin'));
create policy "admin update branches" on public.branches for update to authenticated using (has_role(auth.uid(),'admin'));
-- no delete policy => deletes blocked

create trigger branches_touch before update on public.branches
for each row execute function public.touch_updated_at();

-- Seed default branch
insert into public.branches (name, code, address) values ('Head Office', 'HQ', null);

-- ASSETS: serial number + branch
alter table public.assets add column serial_number text;
alter table public.assets add column branch_id uuid references public.branches(id);
create unique index assets_serial_number_unique on public.assets (serial_number) where serial_number is not null;
create index assets_branch_idx on public.assets (branch_id);

-- Backfill existing assets to head office
update public.assets set branch_id = (select id from public.branches where code='HQ' limit 1) where branch_id is null;

-- Block deletes on assets (retire instead). Drop existing ALL policy and recreate split policies.
drop policy if exists "mgr write assets" on public.assets;
create policy "mgr insert assets" on public.assets for insert to authenticated with check (is_admin_or_manager(auth.uid()));
create policy "mgr update assets" on public.assets for update to authenticated using (is_admin_or_manager(auth.uid()));
create policy "admin delete assets" on public.assets for delete to authenticated using (has_role(auth.uid(),'admin'));

-- ASSET MOVEMENTS
alter table public.asset_movements add column from_user uuid;
alter table public.asset_movements add column to_user uuid;
alter table public.asset_movements add column from_branch_id uuid references public.branches(id);
alter table public.asset_movements add column to_branch_id uuid references public.branches(id);
alter table public.asset_movements add column transfer_type text not null default 'internal' check (transfer_type in ('internal','external'));

-- ASSET ASSIGNMENTS
alter table public.asset_assignments add column branch_id uuid references public.branches(id);

-- DISPOSALS: explicit retirement reason (separate from disposal reason if needed; reuse if null)
alter table public.asset_disposals add column retirement_reason text;

-- AUDIT LOG
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid,
  action text not null,
  actor_user_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_entity_idx on public.audit_log (entity_type, entity_id);
create index audit_log_actor_idx on public.audit_log (actor_user_id);
create index audit_log_created_idx on public.audit_log (created_at desc);

alter table public.audit_log enable row level security;
create policy "mgr read audit" on public.audit_log for select to authenticated using (is_admin_or_manager(auth.uid()));
-- Inserts done via SECURITY DEFINER trigger; no public insert/update/delete policies.

create or replace function public.write_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity_id uuid;
  v_action text;
  v_details jsonb;
begin
  if (tg_op = 'INSERT') then
    v_entity_id := (to_jsonb(new)->>'id')::uuid;
    v_action := 'created';
    v_details := to_jsonb(new);
  elsif (tg_op = 'UPDATE') then
    v_entity_id := (to_jsonb(new)->>'id')::uuid;
    v_action := 'updated';
    v_details := jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new));
    -- Specialise certain actions
    if tg_table_name = 'asset_disposals' then
      if old.status is distinct from new.status then
        v_action := 'disposal_' || new.status;
      end if;
    end if;
    if tg_table_name = 'assets' then
      if old.status is distinct from new.status and new.status = 'retired' then
        v_action := 'retired';
      end if;
    end if;
  elsif (tg_op = 'DELETE') then
    v_entity_id := (to_jsonb(old)->>'id')::uuid;
    v_action := 'deleted';
    v_details := to_jsonb(old);
  end if;

  insert into public.audit_log (entity_type, entity_id, action, actor_user_id, details)
  values (tg_table_name, v_entity_id, v_action, auth.uid(), v_details);

  return coalesce(new, old);
end;
$$;

create trigger audit_assets after insert or update or delete on public.assets
for each row execute function public.write_audit();
create trigger audit_branches after insert or update or delete on public.branches
for each row execute function public.write_audit();
create trigger audit_movements after insert or update or delete on public.asset_movements
for each row execute function public.write_audit();
create trigger audit_assignments after insert or update or delete on public.asset_assignments
for each row execute function public.write_audit();
create trigger audit_disposals after insert or update or delete on public.asset_disposals
for each row execute function public.write_audit();

revoke all on function public.write_audit() from public, anon, authenticated;
revoke all on function public.touch_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- 1. Rename status enum value lost -> missing
ALTER TYPE asset_status RENAME VALUE 'lost' TO 'missing';

-- 2. Assets: new columns
ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS set_for_disposal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS previous_status asset_status;

-- 3. is_active on categories & locations
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.locations  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- 4. Replace combined ALL policies with split insert/update so DELETE is blocked.
DROP POLICY IF EXISTS "mgr write categories" ON public.categories;
DROP POLICY IF EXISTS "mgr insert categories" ON public.categories;
DROP POLICY IF EXISTS "mgr update categories" ON public.categories;
CREATE POLICY "mgr insert categories" ON public.categories FOR INSERT TO authenticated WITH CHECK (is_admin_or_manager(auth.uid()));
CREATE POLICY "mgr update categories" ON public.categories FOR UPDATE TO authenticated USING (is_admin_or_manager(auth.uid()));

DROP POLICY IF EXISTS "mgr write locations" ON public.locations;
DROP POLICY IF EXISTS "mgr insert locations" ON public.locations;
DROP POLICY IF EXISTS "mgr update locations" ON public.locations;
CREATE POLICY "mgr insert locations" ON public.locations FOR INSERT TO authenticated WITH CHECK (is_admin_or_manager(auth.uid()));
CREATE POLICY "mgr update locations" ON public.locations FOR UPDATE TO authenticated USING (is_admin_or_manager(auth.uid()));

DROP POLICY IF EXISTS "admin delete assets" ON public.assets;

-- 5. Audit log cleared flag
ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS cleared_at timestamptz,
  ADD COLUMN IF NOT EXISTS cleared_by uuid;

DROP POLICY IF EXISTS "admin update audit" ON public.audit_log;
CREATE POLICY "admin update audit" ON public.audit_log FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 6. notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  entity_type text,
  entity_id uuid,
  requires_action boolean NOT NULL DEFAULT false,
  action_status text NOT NULL DEFAULT 'pending',
  beep boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, read_at);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users read own notifications" ON public.notifications;
DROP POLICY IF EXISTS "users update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "mgr insert notifications" ON public.notifications;
CREATE POLICY "users read own notifications"   ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "users update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "mgr insert notifications"       ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);

-- 7. approval_requests
CREATE TABLE IF NOT EXISTS public.approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  asset_id uuid,
  requested_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reason text,
  approver_id uuid,
  decided_at timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_approval_status ON public.approval_requests(status, kind);
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth read approvals" ON public.approval_requests;
DROP POLICY IF EXISTS "auth insert approvals" ON public.approval_requests;
DROP POLICY IF EXISTS "mgr update approvals" ON public.approval_requests;
CREATE POLICY "auth read approvals"   ON public.approval_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert approvals" ON public.approval_requests FOR INSERT TO authenticated WITH CHECK (requested_by = auth.uid());
CREATE POLICY "mgr update approvals"  ON public.approval_requests FOR UPDATE TO authenticated USING (is_admin_or_manager(auth.uid()));

-- 8. asset_imports log
CREATE TABLE IF NOT EXISTS public.asset_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  total_rows int NOT NULL DEFAULT 0,
  success_rows int NOT NULL DEFAULT 0,
  error_rows int NOT NULL DEFAULT 0,
  errors jsonb,
  imported_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.asset_imports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth read imports" ON public.asset_imports;
DROP POLICY IF EXISTS "mgr write imports" ON public.asset_imports;
CREATE POLICY "auth read imports" ON public.asset_imports FOR SELECT TO authenticated USING (true);
CREATE POLICY "mgr write imports" ON public.asset_imports FOR INSERT TO authenticated WITH CHECK (is_admin_or_manager(auth.uid()));

-- 9. Notify trigger
CREATE OR REPLACE FUNCTION public.notify_on_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_beep boolean;
BEGIN
  IF tg_op = 'INSERT' THEN
    v_beep := (new.kind IN ('retirement','disposal','reactivation','set_for_disposal'));
    FOR r IN SELECT ur.user_id FROM public.user_roles ur WHERE ur.role IN ('admin','manager') LOOP
      INSERT INTO public.notifications(user_id, type, title, body, entity_type, entity_id, requires_action, beep)
      VALUES (r.user_id, 'approval_requested', 'Approval needed: ' || new.kind,
              'A new ' || new.kind || ' request is pending approval.',
              'approval_requests', new.id, true, v_beep);
    END LOOP;
  ELSIF tg_op = 'UPDATE' AND old.status IS DISTINCT FROM new.status THEN
    INSERT INTO public.notifications(user_id, type, title, body, entity_type, entity_id, requires_action, beep)
    VALUES (new.requested_by, 'approval_decided',
            'Your ' || new.kind || ' request was ' || new.status,
            coalesce(new.reason, ''), 'approval_requests', new.id, false, false);
  END IF;
  RETURN coalesce(new, old);
END; $$;

DROP TRIGGER IF EXISTS trg_notify_approval ON public.approval_requests;
CREATE TRIGGER trg_notify_approval
  AFTER INSERT OR UPDATE ON public.approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_approval();

-- 10. Audit trigger on approvals
DROP TRIGGER IF EXISTS trg_audit_approvals ON public.approval_requests;
CREATE TRIGGER trg_audit_approvals AFTER INSERT OR UPDATE OR DELETE ON public.approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.write_audit();

-- 11. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.approval_requests;

REVOKE EXECUTE ON FUNCTION public.notify_on_approval() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.write_audit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "mgr insert notifications" ON public.notifications;
CREATE POLICY "self insert notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR is_admin_or_manager(auth.uid()));

-- 1. DELETE policies (admin-only)
CREATE POLICY "admin delete assets" ON public.assets FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "admin delete categories" ON public.categories FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "admin delete locations" ON public.locations FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "admin delete branches" ON public.branches FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "admin delete assignments" ON public.asset_assignments FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "admin delete movements" ON public.asset_movements FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "admin delete disposals" ON public.asset_disposals FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "admin delete attachments" ON public.asset_attachments FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "admin delete approvals" ON public.approval_requests FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "admin delete notifications" ON public.notifications FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin') OR user_id = auth.uid());
CREATE POLICY "admin delete audit" ON public.audit_log FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "admin delete profiles" ON public.profiles FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "admin delete user_roles" ON public.user_roles FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- 2. Per-user permission tables
CREATE TABLE public.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  module text NOT NULL,
  can_view boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module)
);
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read user_permissions" ON public.user_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage user_permissions" ON public.user_permissions FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TABLE public.user_approval_rights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  approval_kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, approval_kind)
);
ALTER TABLE public.user_approval_rights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read user_approval_rights" ON public.user_approval_rights FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage user_approval_rights" ON public.user_approval_rights FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- 3. Profile flags
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

-- 4. Approval-notification trigger (was missing in db)
DROP TRIGGER IF EXISTS trg_approval_notify ON public.approval_requests;
CREATE TRIGGER trg_approval_notify
AFTER INSERT OR UPDATE ON public.approval_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_on_approval();

-- 5. Audit triggers (re-attach so deletes/edits get logged)
DROP TRIGGER IF EXISTS trg_audit_assets ON public.assets;
CREATE TRIGGER trg_audit_assets AFTER INSERT OR UPDATE OR DELETE ON public.assets FOR EACH ROW EXECUTE FUNCTION public.write_audit();
DROP TRIGGER IF EXISTS trg_audit_categories ON public.categories;
CREATE TRIGGER trg_audit_categories AFTER INSERT OR UPDATE OR DELETE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.write_audit();
DROP TRIGGER IF EXISTS trg_audit_locations ON public.locations;
CREATE TRIGGER trg_audit_locations AFTER INSERT OR UPDATE OR DELETE ON public.locations FOR EACH ROW EXECUTE FUNCTION public.write_audit();
DROP TRIGGER IF EXISTS trg_audit_branches ON public.branches;
CREATE TRIGGER trg_audit_branches AFTER INSERT OR UPDATE OR DELETE ON public.branches FOR EACH ROW EXECUTE FUNCTION public.write_audit();
DROP TRIGGER IF EXISTS trg_audit_assignments ON public.asset_assignments;
CREATE TRIGGER trg_audit_assignments AFTER INSERT OR UPDATE OR DELETE ON public.asset_assignments FOR EACH ROW EXECUTE FUNCTION public.write_audit();
DROP TRIGGER IF EXISTS trg_audit_movements ON public.asset_movements;
CREATE TRIGGER trg_audit_movements AFTER INSERT OR UPDATE OR DELETE ON public.asset_movements FOR EACH ROW EXECUTE FUNCTION public.write_audit();
DROP TRIGGER IF EXISTS trg_audit_disposals ON public.asset_disposals;
CREATE TRIGGER trg_audit_disposals AFTER INSERT OR UPDATE OR DELETE ON public.asset_disposals FOR EACH ROW EXECUTE FUNCTION public.write_audit();
-- Branch visibility per user (allow-list; empty = see all)
CREATE TABLE IF NOT EXISTS public.user_branch_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, branch_id)
);
ALTER TABLE public.user_branch_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read user_branch_access" ON public.user_branch_access
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage user_branch_access" ON public.user_branch_access
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Action rights (initiate requests / add assets) granted to non-admin users
CREATE TABLE IF NOT EXISTS public.user_action_rights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action_kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, action_kind)
);
ALTER TABLE public.user_action_rights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read user_action_rights" ON public.user_action_rights
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage user_action_rights" ON public.user_action_rights
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Allow users with the 'add_asset' action right to insert assets / assignments / imports / movements
CREATE OR REPLACE FUNCTION public.can_do(_user_id uuid, _action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT has_role(_user_id,'admin'::app_role)
      OR has_role(_user_id,'manager'::app_role)
      OR EXISTS (SELECT 1 FROM public.user_action_rights WHERE user_id=_user_id AND action_kind=_action);
$$;

-- Extend asset write policies to include 'add_asset' grantees
DROP POLICY IF EXISTS "mgr insert assets" ON public.assets;
CREATE POLICY "writer insert assets" ON public.assets
  FOR INSERT TO authenticated WITH CHECK (public.can_do(auth.uid(),'add_asset'));

DROP POLICY IF EXISTS "mgr write assignments" ON public.asset_assignments;
CREATE POLICY "writer write assignments" ON public.asset_assignments
  FOR ALL TO authenticated
  USING (public.can_do(auth.uid(),'add_asset'))
  WITH CHECK (public.can_do(auth.uid(),'add_asset'));

DROP POLICY IF EXISTS "mgr write imports" ON public.asset_imports;
CREATE POLICY "writer write imports" ON public.asset_imports
  FOR INSERT TO authenticated WITH CHECK (public.can_do(auth.uid(),'add_asset'));

-- Allow editors with specific action rights to update assets / locations
DROP POLICY IF EXISTS "mgr update assets" ON public.assets;
CREATE POLICY "editor update assets" ON public.assets
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_manager(auth.uid()) OR public.can_do(auth.uid(), 'edit_asset'));

DROP POLICY IF EXISTS "mgr update locations" ON public.locations;
CREATE POLICY "editor update locations" ON public.locations
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_manager(auth.uid()) OR public.can_do(auth.uid(), 'edit_location'));

-- 1. Per-user notification preferences
CREATE TABLE IF NOT EXISTS public.user_notification_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  approval_kind text NOT NULL,
  in_app boolean NOT NULL DEFAULT true,
  email boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, approval_kind)
);

ALTER TABLE public.user_notification_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own prefs or admin"
  ON public.user_notification_prefs FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "users upsert own prefs"
  ON public.user_notification_prefs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "users update own prefs"
  ON public.user_notification_prefs FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "users delete own prefs"
  ON public.user_notification_prefs FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_user_notification_prefs_updated
  BEFORE UPDATE ON public.user_notification_prefs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. Update notify_on_approval to respect user prefs (in_app default true)
CREATE OR REPLACE FUNCTION public.notify_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE r record; v_beep boolean; v_in_app boolean;
BEGIN
  IF tg_op = 'INSERT' THEN
    v_beep := (new.kind IN ('retirement','disposal','reactivation','set_for_disposal'));
    FOR r IN SELECT ur.user_id FROM public.user_roles ur WHERE ur.role IN ('admin','manager') LOOP
      -- respect per-user prefs; absence means default-on
      SELECT COALESCE(p.in_app, true) INTO v_in_app
        FROM (SELECT 1) s
        LEFT JOIN public.user_notification_prefs p
               ON p.user_id = r.user_id AND p.approval_kind = new.kind;
      IF v_in_app THEN
        INSERT INTO public.notifications(user_id, type, title, body, entity_type, entity_id, requires_action, beep)
        VALUES (r.user_id, 'approval_requested', 'Approval needed: ' || new.kind,
                'A new ' || new.kind || ' request is pending approval.',
                'approval_requests', new.id, true, v_beep);
      END IF;
    END LOOP;
  ELSIF tg_op = 'UPDATE' AND old.status IS DISTINCT FROM new.status THEN
    INSERT INTO public.notifications(user_id, type, title, body, entity_type, entity_id, requires_action, beep)
    VALUES (new.requested_by, 'approval_decided',
            'Your ' || new.kind || ' request was ' || new.status,
            COALESCE('Reason: ' || NULLIF(new.reason, ''), 'No reason provided.'),
            'approval_requests', new.id, false, true);
  END IF;
  RETURN COALESCE(new, old);
END; $function$;

-- 3. Reminder column + function
ALTER TABLE public.approval_requests
  ADD COLUMN IF NOT EXISTS last_reminded_at timestamptz;

CREATE OR REPLACE FUNCTION public.enqueue_approval_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE req record; r record; v_in_app boolean;
BEGIN
  FOR req IN
    SELECT * FROM public.approval_requests
     WHERE status = 'pending'
       AND kind IN ('movement','retirement','disposal')
       AND created_at < now() - interval '24 hours'
       AND (last_reminded_at IS NULL OR last_reminded_at < now() - interval '24 hours')
  LOOP
    FOR r IN SELECT ur.user_id FROM public.user_roles ur WHERE ur.role IN ('admin','manager') LOOP
      SELECT COALESCE(p.in_app, true) INTO v_in_app
        FROM (SELECT 1) s
        LEFT JOIN public.user_notification_prefs p
               ON p.user_id = r.user_id AND p.approval_kind = req.kind;
      IF v_in_app THEN
        INSERT INTO public.notifications(user_id, type, title, body, entity_type, entity_id, requires_action, beep)
        VALUES (r.user_id, 'approval_reminder',
                'Reminder: ' || req.kind || ' awaiting approval',
                'A ' || req.kind || ' request has been pending for over 24 hours.',
                'approval_requests', req.id, true, true);
      END IF;
    END LOOP;
    UPDATE public.approval_requests SET last_reminded_at = now() WHERE id = req.id;
  END LOOP;
END; $$;

-- 4. Schedule hourly reminder
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'approval-reminders-hourly') THEN
    PERFORM cron.unschedule('approval-reminders-hourly');
  END IF;
  PERFORM cron.schedule(
    'approval-reminders-hourly',
    '0 * * * *',
    $cron$ SELECT public.enqueue_approval_reminders(); $cron$
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.enqueue_approval_reminders() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.mark_for_disposal(_asset_id uuid, _on boolean)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.assets SET set_for_disposal = _on WHERE id = _asset_id;
$$;

GRANT EXECUTE ON FUNCTION public.mark_for_disposal(uuid, boolean) TO authenticated;

-- Enums
DO $$ BEGIN
  CREATE TYPE public.depreciation_method AS ENUM ('straight_line','reducing_balance','units_of_production');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.depreciation_frequency AS ENUM ('monthly','quarterly','annually');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Extend assets
ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS depreciation_method public.depreciation_method,
  ADD COLUMN IF NOT EXISTS useful_life_months integer,
  ADD COLUMN IF NOT EXISTS residual_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS depreciation_start_date date,
  ADD COLUMN IF NOT EXISTS depreciation_frequency public.depreciation_frequency DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS total_units numeric,
  ADD COLUMN IF NOT EXISTS units_consumed numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS accumulated_depreciation numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_depreciation_date date,
  ADD COLUMN IF NOT EXISTS impairment_amount numeric NOT NULL DEFAULT 0;

-- Category defaults
CREATE TABLE IF NOT EXISTS public.category_depreciation_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL UNIQUE,
  method public.depreciation_method NOT NULL,
  useful_life_months integer NOT NULL CHECK (useful_life_months > 0),
  residual_percent numeric NOT NULL DEFAULT 0 CHECK (residual_percent >= 0 AND residual_percent < 100),
  frequency public.depreciation_frequency NOT NULL DEFAULT 'monthly',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.category_depreciation_defaults TO authenticated;
GRANT ALL ON public.category_depreciation_defaults TO service_role;
ALTER TABLE public.category_depreciation_defaults ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read cat_dep_defaults" ON public.category_depreciation_defaults
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "mgr write cat_dep_defaults" ON public.category_depreciation_defaults
  FOR ALL TO authenticated
  USING (public.is_admin_or_manager(auth.uid()))
  WITH CHECK (public.is_admin_or_manager(auth.uid()));

-- Runs
CREATE TABLE IF NOT EXISTS public.depreciation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date NOT NULL,
  period_end date NOT NULL,
  run_type text NOT NULL DEFAULT 'manual' CHECK (run_type IN ('manual','scheduled')),
  triggered_by uuid,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','failed','running')),
  total_amount numeric NOT NULL DEFAULT 0,
  asset_count integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_start, period_end)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.depreciation_runs TO authenticated;
GRANT ALL ON public.depreciation_runs TO service_role;
ALTER TABLE public.depreciation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read dep_runs" ON public.depreciation_runs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "mgr insert dep_runs" ON public.depreciation_runs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_manager(auth.uid()) OR public.can_do(auth.uid(),'run_depreciation'));
CREATE POLICY "mgr update dep_runs" ON public.depreciation_runs
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_manager(auth.uid()) OR public.can_do(auth.uid(),'run_depreciation'));
CREATE POLICY "admin delete dep_runs" ON public.depreciation_runs
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role));

-- Entries
CREATE TABLE IF NOT EXISTS public.depreciation_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.depreciation_runs(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  method public.depreciation_method NOT NULL,
  opening_value numeric NOT NULL,
  depreciation_amount numeric NOT NULL,
  accumulated_after numeric NOT NULL,
  closing_value numeric NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, period_end)
);
CREATE INDEX IF NOT EXISTS idx_dep_entries_asset ON public.depreciation_entries(asset_id);
CREATE INDEX IF NOT EXISTS idx_dep_entries_period ON public.depreciation_entries(period_end);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.depreciation_entries TO authenticated;
GRANT ALL ON public.depreciation_entries TO service_role;
ALTER TABLE public.depreciation_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read dep_entries" ON public.depreciation_entries
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "mgr write dep_entries" ON public.depreciation_entries
  FOR ALL TO authenticated
  USING (public.is_admin_or_manager(auth.uid()) OR public.can_do(auth.uid(),'run_depreciation'))
  WITH CHECK (public.is_admin_or_manager(auth.uid()) OR public.can_do(auth.uid(),'run_depreciation'));

-- Overrides (impairment / manual adj)
CREATE TABLE IF NOT EXISTS public.depreciation_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL,
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  type text NOT NULL CHECK (type IN ('impairment','manual_adjustment','residual_change')),
  amount numeric NOT NULL,
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dep_overrides_asset ON public.depreciation_overrides(asset_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.depreciation_overrides TO authenticated;
GRANT ALL ON public.depreciation_overrides TO service_role;
ALTER TABLE public.depreciation_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read dep_overrides" ON public.depreciation_overrides
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "mgr write dep_overrides" ON public.depreciation_overrides
  FOR ALL TO authenticated
  USING (public.is_admin_or_manager(auth.uid()) OR public.can_do(auth.uid(),'override_depreciation'))
  WITH CHECK (public.is_admin_or_manager(auth.uid()) OR public.can_do(auth.uid(),'override_depreciation'));

-- Audit triggers
DROP TRIGGER IF EXISTS audit_dep_runs ON public.depreciation_runs;
CREATE TRIGGER audit_dep_runs AFTER INSERT OR UPDATE OR DELETE ON public.depreciation_runs
  FOR EACH ROW EXECUTE FUNCTION public.write_audit();
DROP TRIGGER IF EXISTS audit_dep_overrides ON public.depreciation_overrides;
CREATE TRIGGER audit_dep_overrides AFTER INSERT OR UPDATE OR DELETE ON public.depreciation_overrides
  FOR EACH ROW EXECUTE FUNCTION public.write_audit();

-- Validation trigger on assets for depreciation config sanity
CREATE OR REPLACE FUNCTION public.validate_asset_depreciation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.residual_value IS NOT NULL AND NEW.purchase_value IS NOT NULL
     AND NEW.residual_value < 0 THEN
    RAISE EXCEPTION 'Residual value cannot be negative';
  END IF;
  IF NEW.residual_value IS NOT NULL AND NEW.purchase_value IS NOT NULL
     AND NEW.residual_value >= NEW.purchase_value THEN
    RAISE EXCEPTION 'Residual value must be less than purchase value';
  END IF;
  IF NEW.useful_life_months IS NOT NULL AND NEW.useful_life_months <= 0 THEN
    RAISE EXCEPTION 'Useful life must be greater than 0';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS validate_asset_depreciation ON public.assets;
CREATE TRIGGER validate_asset_depreciation BEFORE INSERT OR UPDATE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.validate_asset_depreciation();

ALTER TABLE public.depreciation_runs DROP CONSTRAINT IF EXISTS depreciation_runs_run_type_check;
ALTER TABLE public.depreciation_runs ADD CONSTRAINT depreciation_runs_run_type_check
  CHECK (run_type = ANY (ARRAY['manual'::text,'scheduled'::text,'manual_asset'::text,'missed'::text,'catchup'::text]));
ALTER TABLE public.depreciation_runs DROP CONSTRAINT IF EXISTS depreciation_runs_period_start_period_end_key;

-- 1) approval_requests: prevent self-approval at the database level
DROP POLICY IF EXISTS "mgr update approvals" ON public.approval_requests;
CREATE POLICY "mgr update approvals" ON public.approval_requests
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_manager(auth.uid()) AND requested_by IS DISTINCT FROM auth.uid())
  WITH CHECK (public.is_admin_or_manager(auth.uid()) AND requested_by IS DISTINCT FROM auth.uid());

-- 2) asset_disposals: prevent the recorder from approving their own disposal
DROP POLICY IF EXISTS "mgr write disposals" ON public.asset_disposals;
CREATE POLICY "mgr write disposals" ON public.asset_disposals
  FOR ALL TO authenticated
  USING (public.is_admin_or_manager(auth.uid()))
  WITH CHECK (
    public.is_admin_or_manager(auth.uid())
    AND (
      -- inserts and unrelated edits are fine
      status = 'pending'
      OR approved_by IS NULL
      -- when marking approved/rejected, approver must differ from recorder
      OR recorded_by IS NULL
      OR approved_by IS DISTINCT FROM recorded_by
    )
  );

-- 3) profiles: lock down SELECT so users only read their own row
--    Admins/managers can read every profile (needed for the admin UI and
--    the audit/depreciation lookups).
DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "users read profiles" ON public.profiles;
DROP POLICY IF EXISTS "read profiles" ON public.profiles;
DROP POLICY IF EXISTS "profiles select self" ON public.profiles;
DROP POLICY IF EXISTS "profiles select admin" ON public.profiles;

CREATE POLICY "profiles select self" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "profiles select admin" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_admin_or_manager(auth.uid()));

-- 4) user_roles: restrict SELECT (has_role() is SECURITY DEFINER so RLS still works)
DROP POLICY IF EXISTS "users read roles" ON public.user_roles;
DROP POLICY IF EXISTS "read roles" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_select_all" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles select self" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles select admin" ON public.user_roles;

CREATE POLICY "user_roles select self" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "user_roles select admin" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.is_admin_or_manager(auth.uid()));

-- 5) user_permissions / user_action_rights / user_approval_rights / user_branch_access:
--    own rows for staff, full read for admins/managers.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['user_permissions','user_action_rights','user_approval_rights','user_branch_access']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "read %1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "users read %1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s select all" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_select_all" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s select self" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s select admin" ON public.%1$I', t);

    EXECUTE format($p$CREATE POLICY "%1$s select self" ON public.%1$I
      FOR SELECT TO authenticated USING (user_id = auth.uid())$p$, t);
    EXECUTE format($p$CREATE POLICY "%1$s select admin" ON public.%1$I
      FOR SELECT TO authenticated USING (public.is_admin_or_manager(auth.uid()))$p$, t);
  END LOOP;
END $$;

-- 6) notifications: only allow inserts targeting yourself.
--    System notifications come from SECURITY DEFINER triggers (notify_on_approval,
--    enqueue_approval_reminders) which bypass RLS, so they keep working.
DROP POLICY IF EXISTS "self insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "notifications insert" ON public.notifications;
CREATE POLICY "notifications insert self" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 7) Lock down SECURITY DEFINER helpers so anonymous role can't probe them.
--    Keep EXECUTE for authenticated where RLS policies/UI need them.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin_or_manager(uuid)       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_do(uuid, text)              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_for_disposal(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.enqueue_approval_reminders()    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_manager(uuid)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_do(uuid, text)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_for_disposal(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_approval_reminders()    TO service_role;

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'security';
ALTER TYPE public.asset_status ADD VALUE IF NOT EXISTS 'checked_out';

CREATE SEQUENCE IF NOT EXISTS public.gate_pass_number_seq START 1;

CREATE TABLE IF NOT EXISTS public.gate_passes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pass_number text UNIQUE,
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id),
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text NOT NULL,
  destination text NOT NULL,
  expected_return_date date NOT NULL,
  attachment_url text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','checked_out','returned','cancelled')),
  approver_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_reason text,
  checked_out_at timestamptz,
  checked_out_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  returned_at timestamptz,
  returned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  return_condition text,
  return_notes text,
  previous_asset_status public.asset_status,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gate_passes_asset_idx ON public.gate_passes(asset_id);
CREATE INDEX IF NOT EXISTS gate_passes_branch_idx ON public.gate_passes(branch_id);
CREATE INDEX IF NOT EXISTS gate_passes_status_idx ON public.gate_passes(status);
CREATE INDEX IF NOT EXISTS gate_passes_requested_by_idx ON public.gate_passes(requested_by);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gate_passes TO authenticated;
GRANT ALL ON public.gate_passes TO service_role;
GRANT USAGE ON SEQUENCE public.gate_pass_number_seq TO authenticated, service_role;

ALTER TABLE public.gate_passes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read gate_passes" ON public.gate_passes FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "self insert gate_passes" ON public.gate_passes FOR INSERT
  TO authenticated WITH CHECK (requested_by = auth.uid());

CREATE POLICY "approver/owner update gate_passes" ON public.gate_passes FOR UPDATE
  TO authenticated USING (
    public.is_admin_or_manager(auth.uid())
    OR public.has_role(auth.uid(), 'security'::public.app_role)
    OR public.can_do(auth.uid(), 'approve_gate_pass')
    OR public.can_do(auth.uid(), 'verify_gate_pass')
    OR requested_by = auth.uid()
  );

CREATE POLICY "admin delete gate_passes" ON public.gate_passes FOR DELETE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.assign_gate_pass_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.status IN ('approved','checked_out')) AND NEW.pass_number IS NULL THEN
    NEW.pass_number := 'GP-' || to_char(now(), 'YYYY') || '-' ||
      lpad(nextval('public.gate_pass_number_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_gate_pass_number ON public.gate_passes;
CREATE TRIGGER trg_gate_pass_number BEFORE INSERT OR UPDATE ON public.gate_passes
  FOR EACH ROW EXECUTE FUNCTION public.assign_gate_pass_number();

DROP TRIGGER IF EXISTS trg_gate_passes_touch ON public.gate_passes;
CREATE TRIGGER trg_gate_passes_touch BEFORE UPDATE ON public.gate_passes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_gate_passes_audit ON public.gate_passes;
CREATE TRIGGER trg_gate_passes_audit AFTER INSERT OR UPDATE OR DELETE ON public.gate_passes
  FOR EACH ROW EXECUTE FUNCTION public.write_audit();

CREATE OR REPLACE FUNCTION public.notify_on_gate_pass()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record;
BEGIN
  IF tg_op = 'INSERT' THEN
    FOR r IN
      SELECT user_id FROM public.user_roles
      WHERE role IN ('admin','manager','security')
      UNION
      SELECT user_id FROM public.user_action_rights
      WHERE action_kind IN ('approve_gate_pass','verify_gate_pass')
    LOOP
      INSERT INTO public.notifications(user_id, type, title, body, entity_type, entity_id, requires_action, beep)
      VALUES (r.user_id, 'gate_pass_requested', 'New gate pass request',
              'A new gate pass is awaiting approval.',
              'gate_passes', NEW.id, true, true);
    END LOOP;
  ELSIF tg_op = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.notifications(user_id, type, title, body, entity_type, entity_id, requires_action, beep)
    VALUES (NEW.requested_by, 'gate_pass_' || NEW.status,
            'Your gate pass was ' || NEW.status,
            COALESCE('Pass: ' || NEW.pass_number, 'Status changed'),
            'gate_passes', NEW.id, false, true);
  END IF;
  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.notify_on_gate_pass() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_on_gate_pass() TO service_role;

REVOKE EXECUTE ON FUNCTION public.assign_gate_pass_number() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_gate_passes_notify ON public.gate_passes;
CREATE TRIGGER trg_gate_passes_notify AFTER INSERT OR UPDATE ON public.gate_passes
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_gate_pass();

-- Document templates: one organization-wide settings row controls all generated PDFs.
CREATE TABLE public.document_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Default',
  is_active boolean NOT NULL DEFAULT true,
  -- branding
  logo_data_url text,
  logo_position text NOT NULL DEFAULT 'left' CHECK (logo_position IN ('left','center','right','none')),
  logo_max_height numeric NOT NULL DEFAULT 14,
  organization_name text NOT NULL DEFAULT 'Your Organization',
  -- header/footer
  header_text text NOT NULL DEFAULT '',
  header_show boolean NOT NULL DEFAULT true,
  footer_text text NOT NULL DEFAULT '',
  footer_show boolean NOT NULL DEFAULT true,
  show_page_numbers boolean NOT NULL DEFAULT true,
  show_generated_at boolean NOT NULL DEFAULT true,
  -- watermark
  watermark_text text NOT NULL DEFAULT '',
  watermark_image_data_url text,
  watermark_opacity numeric NOT NULL DEFAULT 0.10 CHECK (watermark_opacity >= 0 AND watermark_opacity <= 1),
  watermark_position text NOT NULL DEFAULT 'diagonal' CHECK (watermark_position IN ('center','diagonal','repeated','none')),
  -- layout
  font_family text NOT NULL DEFAULT 'helvetica' CHECK (font_family IN ('helvetica','times','courier')),
  base_font_size numeric NOT NULL DEFAULT 10 CHECK (base_font_size BETWEEN 6 AND 24),
  margin_top numeric NOT NULL DEFAULT 20,
  margin_right numeric NOT NULL DEFAULT 14,
  margin_bottom numeric NOT NULL DEFAULT 20,
  margin_left numeric NOT NULL DEFAULT 14,
  orientation text NOT NULL DEFAULT 'portrait' CHECK (orientation IN ('portrait','landscape')),
  paper_size text NOT NULL DEFAULT 'a4' CHECK (paper_size IN ('a4','letter','legal')),
  -- theme
  primary_color text NOT NULL DEFAULT '#1e293b',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_templates TO authenticated;
GRANT ALL ON public.document_templates TO service_role;

ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Any authenticated user can read templates"
  ON public.document_templates FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authorized users can insert templates"
  ON public.document_templates FOR INSERT TO authenticated
  WITH CHECK (public.can_do(auth.uid(), 'manage_document_templates'));

CREATE POLICY "Authorized users can update templates"
  ON public.document_templates FOR UPDATE TO authenticated
  USING (public.can_do(auth.uid(), 'manage_document_templates'))
  WITH CHECK (public.can_do(auth.uid(), 'manage_document_templates'));

CREATE POLICY "Authorized users can delete templates"
  ON public.document_templates FOR DELETE TO authenticated
  USING (public.can_do(auth.uid(), 'manage_document_templates'));

CREATE TRIGGER trg_document_templates_touch
  BEFORE UPDATE ON public.document_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed a default row
INSERT INTO public.document_templates (name, is_active)
VALUES ('Default', true);

-- Remove orphan rows so we can introduce the FK
DELETE FROM public.depreciation_entries WHERE asset_id NOT IN (SELECT id FROM public.assets);
DELETE FROM public.depreciation_overrides WHERE asset_id NOT IN (SELECT id FROM public.assets);

ALTER TABLE public.depreciation_entries
  DROP CONSTRAINT IF EXISTS depreciation_entries_asset_id_fkey;
ALTER TABLE public.depreciation_entries
  ADD CONSTRAINT depreciation_entries_asset_id_fkey
  FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;

ALTER TABLE public.depreciation_overrides
  DROP CONSTRAINT IF EXISTS depreciation_overrides_asset_id_fkey;
ALTER TABLE public.depreciation_overrides
  ADD CONSTRAINT depreciation_overrides_asset_id_fkey
  FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.delete_asset_cascade(_asset_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.notifications WHERE entity_type = 'assets' AND entity_id = _asset_id;
  DELETE FROM public.audit_log     WHERE entity_type = 'assets' AND entity_id = _asset_id;
  DELETE FROM public.approval_requests WHERE asset_id = _asset_id;
  DELETE FROM public.assets WHERE id = _asset_id;
END $$;

GRANT EXECUTE ON FUNCTION public.delete_asset_cascade(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_asset_cascade(_asset_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_action_rights
       WHERE user_id = auth.uid() AND action_kind = 'approve_asset_deletion'
    )
  ) THEN
    RAISE EXCEPTION 'Not authorised to delete assets';
  END IF;

  DELETE FROM public.notifications WHERE entity_type = 'assets' AND entity_id = _asset_id;
  DELETE FROM public.audit_log     WHERE entity_type = 'assets' AND entity_id = _asset_id;
  DELETE FROM public.approval_requests WHERE asset_id = _asset_id;
  DELETE FROM public.assets WHERE id = _asset_id;
END $$;

-- 1) condition column on assets
DO $$ BEGIN
  CREATE TYPE public.asset_condition AS ENUM ('mint','good','fair','poor','damaged');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS condition public.asset_condition;

-- 2) verifications table
CREATE TABLE IF NOT EXISTS public.asset_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  custodian_name text,
  department text,
  condition public.asset_condition,
  status text NOT NULL CHECK (status IN ('verified','mismatched','not_found')),
  notes text,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_verifications_asset ON public.asset_verifications(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_verifications_branch ON public.asset_verifications(branch_id);
CREATE INDEX IF NOT EXISTS idx_asset_verifications_status ON public.asset_verifications(status);
CREATE INDEX IF NOT EXISTS idx_asset_verifications_verified_at ON public.asset_verifications(verified_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_verifications TO authenticated;
GRANT ALL ON public.asset_verifications TO service_role;

ALTER TABLE public.asset_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "verif_select_auth" ON public.asset_verifications
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "verif_insert_rights" ON public.asset_verifications
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'manager'::app_role)
    OR EXISTS (SELECT 1 FROM public.user_action_rights
               WHERE user_id = auth.uid() AND action_kind = 'perform_verification')
  );

CREATE POLICY "verif_update_admin" ON public.asset_verifications
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_manager(auth.uid()))
  WITH CHECK (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "verif_delete_admin" ON public.asset_verifications
  FOR DELETE TO authenticated
  USING (public.is_admin_or_manager(auth.uid()));

CREATE TRIGGER touch_asset_verifications
  BEFORE UPDATE ON public.asset_verifications
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- audit
CREATE TRIGGER audit_asset_verifications
  AFTER INSERT OR UPDATE OR DELETE ON public.asset_verifications
  FOR EACH ROW EXECUTE FUNCTION public.write_audit();
DROP POLICY IF EXISTS "mgr update approvals" ON public.approval_requests;

CREATE POLICY "eligible approvers can decide approvals"
ON public.approval_requests
FOR UPDATE
TO authenticated
USING (
  status = 'pending'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.user_approval_rights uar
      WHERE uar.user_id = auth.uid()
        AND uar.approval_kind = approval_requests.kind
    )
  )
  AND (
    requested_by IS DISTINCT FROM auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.user_action_rights uar
      WHERE uar.user_id = auth.uid()
        AND uar.action_kind = 'approve_own_request'
    )
  )
)
WITH CHECK (
  (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.user_approval_rights uar
      WHERE uar.user_id = auth.uid()
        AND uar.approval_kind = approval_requests.kind
    )
  )
  AND (
    requested_by IS DISTINCT FROM auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.user_action_rights uar
      WHERE uar.user_id = auth.uid()
        AND uar.action_kind = 'approve_own_request'
    )
  )
);
REVOKE EXECUTE ON FUNCTION public.delete_asset_cascade(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_on_gate_pass() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.write_audit() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_approval() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_approval_reminders() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_for_disposal(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_asset_cascade(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_asset_cascade(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_asset_cascade(uuid) TO authenticated;
-- Insert demo user into auth.users if they don't already exist
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  recovery_sent_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  'd0d4fb77-2f58-4ee0-8bde-d2cc03fdf526',
  'authenticated',
  'authenticated',
  'bangella23@gmail.com',
  '$2a$12$UJ8wCnRS9oqTVNQR6/paaOFEsD/muu1i5q6BQ.lv3SC7WzYB/GPfy',
  NOW(),
  NULL,
  NULL,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Demo User"}'::jsonb,
  NOW(),
  NOW(),
  '',
  '',
  '',
  ''
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users WHERE email = 'bangella23@gmail.com'
);

-- The 'on_auth_user_created' trigger automatically adds the profile and a default role.
-- We want to ensure the demo user is specifically an 'admin'.
DELETE FROM public.user_roles WHERE user_id = 'd0d4fb77-2f58-4ee0-8bde-d2cc03fdf526';
INSERT INTO public.user_roles (user_id, role)
VALUES ('d0d4fb77-2f58-4ee0-8bde-d2cc03fdf526', 'admin');

ALTER TABLE public.depreciation_runs
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS error_stack TEXT;

CREATE TABLE IF NOT EXISTS public.depreciation_run_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.depreciation_runs(id) ON DELETE CASCADE,
  step TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('info','success','warning','error')),
  message TEXT,
  asset_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.depreciation_run_logs TO authenticated;
GRANT ALL ON public.depreciation_run_logs TO service_role;

ALTER TABLE public.depreciation_run_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read run logs" ON public.depreciation_run_logs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth insert run logs" ON public.depreciation_run_logs
  FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_manager(auth.uid()) OR can_do(auth.uid(),'run_depreciation'));

CREATE INDEX IF NOT EXISTS depreciation_run_logs_run_id_idx
  ON public.depreciation_run_logs(run_id, created_at);

-- Notification trigger when a depreciation run fails
CREATE OR REPLACE FUNCTION public.notify_on_failed_depreciation_run()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record;
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.status = 'failed')
     OR (TG_OP = 'UPDATE' AND NEW.status = 'failed' AND OLD.status IS DISTINCT FROM NEW.status) THEN
    FOR r IN SELECT user_id FROM public.user_roles WHERE role IN ('admin','manager') LOOP
      INSERT INTO public.notifications(user_id, type, title, body, entity_type, entity_id, requires_action, beep)
      VALUES (
        r.user_id,
        'depreciation_run_failed',
        'Depreciation run failed Â· ' || NEW.period_start || ' â†’ ' || NEW.period_end,
        COALESCE(NULLIF(NEW.error_message, ''), NEW.notes, 'Run was marked failed.'),
        'depreciation_runs',
        NEW.id,
        false,
        true
      );
    END LOOP;
    -- Also notify the user who triggered the run, if not admin/manager already covered
    IF NEW.triggered_by IS NOT NULL THEN
      INSERT INTO public.notifications(user_id, type, title, body, entity_type, entity_id, requires_action, beep)
      SELECT NEW.triggered_by, 'depreciation_run_failed',
             'Your depreciation run failed Â· ' || NEW.period_start || ' â†’ ' || NEW.period_end,
             COALESCE(NULLIF(NEW.error_message, ''), NEW.notes, 'Run was marked failed.'),
             'depreciation_runs', NEW.id, false, true
      WHERE NOT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = NEW.triggered_by AND role IN ('admin','manager')
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_failed_dep_run ON public.depreciation_runs;
CREATE TRIGGER notify_failed_dep_run
AFTER INSERT OR UPDATE ON public.depreciation_runs
FOR EACH ROW EXECUTE FUNCTION public.notify_on_failed_depreciation_run();

REVOKE EXECUTE ON FUNCTION public.notify_on_failed_depreciation_run() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "admin delete audit" ON public.audit_log;
DROP POLICY IF EXISTS "admin update audit" ON public.audit_log;

CREATE POLICY "manage audit delete" ON public.audit_log
  FOR DELETE USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.user_action_rights
               WHERE user_id = auth.uid() AND action_kind = 'manage_audit_log')
  );

CREATE POLICY "manage audit update" ON public.audit_log
  FOR UPDATE USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.user_action_rights
               WHERE user_id = auth.uid() AND action_kind = 'manage_audit_log')
  );
