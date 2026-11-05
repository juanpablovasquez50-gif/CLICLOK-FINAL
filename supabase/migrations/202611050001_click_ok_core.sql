-- CLICK OK core restaurant workspace.
-- This migration targets the Supabase project configured for this app.
-- Do not run it against the Replit-managed database.

create extension if not exists pgcrypto with schema extensions;

create type public.business_role as enum (
  'owner',
  'admin',
  'editor',
  'operator',
  'waiter',
  'cashier',
  'kitchen',
  'courier'
);

create type public.order_status as enum (
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'on_the_way',
  'delivered',
  'cancelled'
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  currency text not null default 'COP' check (currency = 'COP'),
  created_at timestamptz not null default now()
);

create table public.memberships (
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.business_role not null default 'owner',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

create index memberships_user_id_idx on public.memberships (user_id, active);

create or replace function public.is_business_member(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.business_id = p_business_id
      and m.user_id = (select auth.uid())
      and m.active
  );
$$;

create or replace function public.has_business_role(
  p_business_id uuid,
  p_roles public.business_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.business_id = p_business_id
      and m.user_id = (select auth.uid())
      and m.active
      and m.role = any (p_roles)
  );
$$;

create or replace function public.create_business(p_name text, p_slug text)
returns setof public.businesses
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_business public.businesses;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if char_length(trim(p_name)) < 2
    or char_length(trim(p_name)) > 100
    or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or char_length(p_slug) > 60 then
    raise exception 'Invalid business details';
  end if;

  insert into public.businesses (name, slug)
  values (trim(p_name), p_slug)
  returning * into created_business;

  insert into public.memberships (business_id, user_id, role)
  values (created_business.id, current_user_id, 'owner');

  return next created_business;
end;
$$;

revoke all on function public.is_business_member(uuid) from public;
revoke all on function public.has_business_role(uuid, public.business_role[]) from public;
revoke all on function public.create_business(text, text) from public;
grant execute on function public.is_business_member(uuid) to authenticated;
grant execute on function public.has_business_role(uuid, public.business_role[]) to authenticated;
grant execute on function public.create_business(text, text) to authenticated;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  sort_order integer not null default 0 check (sort_order >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, business_id),
  unique (business_id, name)
);

create index categories_business_sort_idx
  on public.categories (business_id, sort_order, created_at);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  category_id uuid,
  name text not null check (char_length(trim(name)) between 1 and 120),
  description text check (description is null or char_length(description) <= 1000),
  price_cop integer not null check (price_cop >= 0),
  available boolean not null default true,
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (category_id, business_id)
    references public.categories (id, business_id)
    on delete set null (category_id)
);

create index products_business_category_idx
  on public.products (business_id, category_id, created_at);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 1 and 160),
  phone text,
  email text,
  created_at timestamptz not null default now(),
  unique (id, business_id)
);

create index customers_business_created_idx
  on public.customers (business_id, created_at desc);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid,
  order_number integer generated by default as identity unique,
  customer_name text not null check (char_length(trim(customer_name)) between 1 and 160),
  total_cop integer not null check (total_cop >= 0),
  status public.order_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (customer_id, business_id)
    references public.customers (id, business_id)
    on delete set null (customer_id)
);

create index orders_business_created_idx
  on public.orders (business_id, created_at desc);
create index orders_business_status_created_idx
  on public.orders (business_id, status, created_at desc);

create table public.order_status_history (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  old_status public.order_status,
  new_status public.order_status not null,
  changed_by uuid references auth.users (id) on delete set null,
  changed_at timestamptz not null default now()
);

create index order_status_history_business_order_idx
  on public.order_status_history (business_id, order_id, changed_at desc);

create or replace function public.record_order_status_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_status_history
      (business_id, order_id, old_status, new_status, changed_by)
    values
      (new.business_id, new.id, null, new.status, auth.uid());
  elsif old.status is distinct from new.status then
    insert into public.order_status_history
      (business_id, order_id, old_status, new_status, changed_by)
    values
      (new.business_id, new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end;
$$;

create trigger orders_record_initial_status
  after insert on public.orders
  for each row execute function public.record_order_status_history();
create trigger orders_record_status_change
  after update of status on public.orders
  for each row execute function public.record_order_status_history();

-- Status changes are an atomic operation with a server-side transition check.
create or replace function public.advance_order_status(
  p_order_id uuid,
  p_status public.order_status
)
returns setof public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row public.orders;
  transition_allowed boolean := false;
begin
  select * into order_row
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found or not public.is_business_member(order_row.business_id) then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  if not public.has_business_role(
    order_row.business_id,
    array['owner', 'admin', 'operator', 'cashier', 'kitchen', 'courier']::public.business_role[]
  ) then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  if order_row.status = p_status then
    return next order_row;
    return;
  end if;

  transition_allowed :=
    (order_row.status = 'pending' and p_status in ('confirmed', 'cancelled'))
    or (order_row.status = 'confirmed' and p_status in ('preparing', 'cancelled'))
    or (order_row.status = 'preparing' and p_status in ('ready', 'cancelled'))
    or (order_row.status = 'ready' and p_status in ('on_the_way', 'delivered'))
    or (order_row.status = 'on_the_way' and p_status = 'delivered');

  if not transition_allowed then
    raise exception 'Invalid order status transition' using errcode = '22023';
  end if;

  update public.orders o
  set status = p_status
  where o.id = p_order_id
  returning * into order_row;

  return next order_row;
end;
$$;

revoke all on function public.advance_order_status(uuid, public.order_status) from public;
grant execute on function public.advance_order_status(uuid, public.order_status) to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- Keep profile records synchronized with Supabase Auth.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.memberships enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_status_history enable row level security;

-- Remove any broad default grants before granting only what the first release uses.
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.businesses from anon, authenticated;
revoke all on table public.memberships from anon, authenticated;
revoke all on table public.categories from anon, authenticated;
revoke all on table public.products from anon, authenticated;
revoke all on table public.customers from anon, authenticated;
revoke all on table public.orders from anon, authenticated;
revoke all on table public.order_status_history from anon, authenticated;

create policy "profiles_select_own"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "businesses_select_member"
  on public.businesses for select to authenticated
  using (public.is_business_member(id));

create policy "memberships_select_self_or_owner"
  on public.memberships for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.has_business_role(
      business_id,
      array['owner', 'admin']::public.business_role[]
    )
  );

create policy "categories_select_member"
  on public.categories for select to authenticated
  using (public.is_business_member(business_id));
create policy "categories_insert_manager"
  on public.categories for insert to authenticated
  with check (
    public.has_business_role(
      business_id,
      array['owner', 'admin', 'editor']::public.business_role[]
    )
  );
create policy "categories_update_manager"
  on public.categories for update to authenticated
  using (
    public.has_business_role(
      business_id,
      array['owner', 'admin', 'editor']::public.business_role[]
    )
  )
  with check (
    public.has_business_role(
      business_id,
      array['owner', 'admin', 'editor']::public.business_role[]
    )
  );
create policy "categories_delete_manager"
  on public.categories for delete to authenticated
  using (
    public.has_business_role(
      business_id,
      array['owner', 'admin', 'editor']::public.business_role[]
    )
  );

create policy "products_select_member"
  on public.products for select to authenticated
  using (public.is_business_member(business_id));
create policy "products_insert_manager"
  on public.products for insert to authenticated
  with check (
    public.has_business_role(
      business_id,
      array['owner', 'admin', 'editor']::public.business_role[]
    )
  );
create policy "products_update_manager"
  on public.products for update to authenticated
  using (
    public.has_business_role(
      business_id,
      array['owner', 'admin', 'editor']::public.business_role[]
    )
  )
  with check (
    public.has_business_role(
      business_id,
      array['owner', 'admin', 'editor']::public.business_role[]
    )
  );
create policy "products_delete_manager"
  on public.products for delete to authenticated
  using (
    public.has_business_role(
      business_id,
      array['owner', 'admin', 'editor']::public.business_role[]
    )
  );

create policy "customers_select_member"
  on public.customers for select to authenticated
  using (public.is_business_member(business_id));

create policy "orders_select_member"
  on public.orders for select to authenticated
  using (public.is_business_member(business_id));
create policy "orders_update_operator"
  on public.orders for update to authenticated
  using (
    public.has_business_role(
      business_id,
      array['owner', 'admin', 'operator', 'cashier', 'kitchen', 'courier']::public.business_role[]
    )
  )
  with check (
    public.has_business_role(
      business_id,
      array['owner', 'admin', 'operator', 'cashier', 'kitchen', 'courier']::public.business_role[]
    )
  );

create policy "order_history_select_member"
  on public.order_status_history for select to authenticated
  using (public.is_business_member(business_id));

grant select (id, display_name, created_at) on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select (id, name, slug, currency, created_at) on public.businesses to authenticated;
grant select (business_id, user_id, role, active, created_at) on public.memberships to authenticated;
grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.products to authenticated;
grant select (id, business_id, full_name, phone, email, created_at) on public.customers to authenticated;
grant select (id, business_id, customer_id, order_number, customer_name, total_cop, status, created_at, updated_at)
  on public.orders to authenticated;
grant select (id, business_id, order_id, old_status, new_status, changed_by, changed_at)
  on public.order_status_history to authenticated;
