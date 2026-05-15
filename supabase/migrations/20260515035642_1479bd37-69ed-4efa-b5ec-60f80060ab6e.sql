
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
