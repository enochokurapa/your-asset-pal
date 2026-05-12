
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
