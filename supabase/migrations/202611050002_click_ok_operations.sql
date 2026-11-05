-- CLICK OK operational foundation: inventory, order lines and cash control.
-- Apply after 202611050001_click_ok_core.sql in a Supabase staging project first.
-- All operational records are business-scoped and protected by RLS.

alter table public.products
  add column if not exists track_inventory boolean not null default false,
  add column if not exists stock_quantity integer not null default 0
    check (stock_quantity >= 0),
  add column if not exists low_stock_threshold integer not null default 0
    check (low_stock_threshold >= 0);

-- Composite unique keys are created before dependent composite foreign keys.
create unique index if not exists products_id_business_id_unique
  on public.products(id, business_id);
create unique index if not exists orders_id_business_id_unique
  on public.orders(id, business_id);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  order_id uuid not null,
  product_id uuid,
  product_name text not null check (char_length(trim(product_name)) between 1 and 160),
  quantity integer not null check (quantity between 1 and 1000000),
  unit_price_cop integer not null check (unit_price_cop >= 0),
  line_total_cop bigint generated always as (quantity::bigint * unit_price_cop::bigint) stored,
  created_at timestamptz not null default now(),
  foreign key (order_id, business_id)
    references public.orders(id, business_id) on delete cascade,
  foreign key (product_id, business_id)
    references public.products(id, business_id) on delete set null (product_id)
);

create index if not exists order_items_business_order_idx
  on public.order_items(business_id, order_id, created_at);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id uuid not null,
  movement_type text not null check (movement_type in ('in', 'out', 'adjustment')),
  quantity integer not null check (quantity > 0),
  stock_before integer not null check (stock_before >= 0),
  stock_after integer not null check (stock_after >= 0),
  note text check (note is null or char_length(note) <= 500),
  reference_type text not null default 'manual'
    check (reference_type in ('manual', 'purchase', 'sale', 'return', 'correction')),
  reference_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (product_id, business_id)
    references public.products(id, business_id) on delete cascade
);

create index if not exists inventory_movements_product_created_idx
  on public.inventory_movements(business_id, product_id, created_at desc);

create table if not exists public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  opened_by uuid not null references auth.users(id),
  closed_by uuid references auth.users(id),
  opening_amount_cop bigint not null default 0 check (opening_amount_cop between 0 and 2000000000),
  closing_amount_cop bigint check (closing_amount_cop is null or closing_amount_cop between 0 and 2000000000),
  expected_amount_cop bigint check (expected_amount_cop is null or expected_amount_cop between 0 and 2000000000),
  difference_cop bigint,
  status text not null default 'open' check (status in ('open', 'closed')),
  notes text check (notes is null or char_length(notes) <= 1000),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (id, business_id),
  check (
    (status = 'open' and closed_at is null and closed_by is null and closing_amount_cop is null)
    or
    (status = 'closed' and closed_at is not null and closed_by is not null and closing_amount_cop is not null)
  )
);

create unique index if not exists cash_sessions_one_open_per_business
  on public.cash_sessions(business_id) where status = 'open';
create index if not exists cash_sessions_business_opened_idx
  on public.cash_sessions(business_id, opened_at desc);

create table if not exists public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  cash_session_id uuid not null,
  movement_type text not null check (movement_type in ('sale', 'income', 'expense', 'refund')),
  amount_cop bigint not null check (amount_cop between 1 and 2000000000),
  description text not null check (char_length(trim(description)) between 1 and 240),
  reference_id uuid,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (cash_session_id, business_id)
    references public.cash_sessions(id, business_id) on delete cascade
);

create index if not exists cash_movements_session_created_idx
  on public.cash_movements(business_id, cash_session_id, created_at);

alter table public.order_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.cash_sessions enable row level security;
alter table public.cash_movements enable row level security;

revoke all on table public.order_items, public.inventory_movements,
  public.cash_sessions, public.cash_movements from anon, authenticated;

create policy "order_items_select_member"
  on public.order_items for select to authenticated
  using (public.is_business_member(business_id));
create policy "inventory_movements_select_member"
  on public.inventory_movements for select to authenticated
  using (public.is_business_member(business_id));
create policy "cash_sessions_select_member"
  on public.cash_sessions for select to authenticated
  using (public.is_business_member(business_id));
create policy "cash_movements_select_member"
  on public.cash_movements for select to authenticated
  using (public.is_business_member(business_id));

grant select on public.order_items, public.inventory_movements,
  public.cash_sessions, public.cash_movements to authenticated;

create or replace function public.adjust_product_stock(
  p_product_id uuid,
  p_movement_type text,
  p_quantity integer,
  p_note text default null,
  p_reference_type text default 'manual'
)
returns public.inventory_movements
language plpgsql
security definer
set search_path = ''
as $$
declare
  product_row public.products;
  movement public.inventory_movements;
  next_stock integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_movement_type not in ('in', 'out', 'adjustment')
    or p_quantity is null or p_quantity <= 0 or p_quantity > 1000000
    or (p_note is not null and char_length(p_note) > 500)
    or p_reference_type not in ('manual', 'purchase', 'sale', 'return', 'correction') then
    raise exception 'Invalid inventory movement' using errcode = '22023';
  end if;

  select * into product_row
  from public.products p
  where p.id = p_product_id
  for update;

  if not found then
    raise exception 'Product not found' using errcode = 'P0002';
  end if;
  if not public.has_business_role(
    product_row.business_id,
    array['owner', 'admin', 'inventory']::public.business_role[]
  ) then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;
  if not product_row.track_inventory then
    raise exception 'Inventory tracking is not enabled for this product' using errcode = '22023';
  end if;

  next_stock := case
    when p_movement_type = 'in' then product_row.stock_quantity + p_quantity
    when p_movement_type = 'out' then product_row.stock_quantity - p_quantity
    else p_quantity
  end;
  if next_stock < 0 then
    raise exception 'Insufficient stock' using errcode = '22023';
  end if;

  update public.products set stock_quantity = next_stock where id = p_product_id;
  insert into public.inventory_movements (
    business_id, product_id, movement_type, quantity,
    stock_before, stock_after, note, reference_type, created_by
  ) values (
    product_row.business_id, product_row.id, p_movement_type, p_quantity,
    product_row.stock_quantity, next_stock, nullif(trim(p_note), ''),
    p_reference_type, auth.uid()
  ) returning * into movement;

  return movement;
end;
$$;

create or replace function public.open_cash_session(
  p_business_id uuid, p_opening_amount_cop bigint, p_notes text default null
)
returns public.cash_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_row public.cash_sessions;
begin
  if auth.uid() is null or p_opening_amount_cop is null
    or p_opening_amount_cop not between 0 and 2000000000
    or (p_notes is not null and char_length(p_notes) > 1000) then
    raise exception 'Invalid cash session details' using errcode = '22023';
  end if;
  if not public.has_business_role(
    p_business_id, array['owner', 'admin', 'cashier']::public.business_role[]
  ) then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  insert into public.cash_sessions(business_id, opened_by, opening_amount_cop, notes)
  values (p_business_id, auth.uid(), p_opening_amount_cop, nullif(trim(p_notes), ''))
  returning * into session_row;
  return session_row;
end;
$$;

create or replace function public.record_cash_movement(
  p_session_id uuid, p_movement_type text, p_amount_cop bigint,
  p_description text, p_reference_id uuid default null
)
returns public.cash_movements
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_row public.cash_sessions;
  movement public.cash_movements;
begin
  if auth.uid() is null or p_movement_type not in ('sale', 'income', 'expense', 'refund')
    or p_amount_cop is null or p_amount_cop not between 1 and 2000000000
    or p_description is null or char_length(trim(p_description)) not between 1 and 240 then
    raise exception 'Invalid cash movement' using errcode = '22023';
  end if;

  select * into session_row from public.cash_sessions
  where id = p_session_id for update;
  if not found then
    raise exception 'Cash session not found' using errcode = 'P0002';
  end if;
  if session_row.status <> 'open' then
    raise exception 'Cash session is closed' using errcode = '22023';
  end if;
  if not public.has_business_role(
    session_row.business_id, array['owner', 'admin', 'cashier']::public.business_role[]
  ) then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  insert into public.cash_movements(
    business_id, cash_session_id, movement_type, amount_cop, description, reference_id, created_by
  ) values (
    session_row.business_id, session_row.id, p_movement_type, p_amount_cop,
    trim(p_description), p_reference_id, auth.uid()
  ) returning * into movement;
  return movement;
end;
$$;

create or replace function public.close_cash_session(
  p_session_id uuid, p_closing_amount_cop bigint, p_notes text default null
)
returns public.cash_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_row public.cash_sessions;
  expected bigint;
begin
  if auth.uid() is null or p_closing_amount_cop is null
    or p_closing_amount_cop not between 0 and 2000000000
    or (p_notes is not null and char_length(p_notes) > 1000) then
    raise exception 'Invalid cash closing details' using errcode = '22023';
  end if;

  select * into session_row from public.cash_sessions
  where id = p_session_id for update;
  if not found then
    raise exception 'Cash session not found' using errcode = 'P0002';
  end if;
  if not public.has_business_role(
    session_row.business_id, array['owner', 'admin', 'cashier']::public.business_role[]
  ) then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;
  if session_row.status <> 'open' then
    raise exception 'Cash session is already closed' using errcode = '22023';
  end if;

  select session_row.opening_amount_cop + coalesce(sum(
    case when movement_type in ('sale', 'income') then amount_cop else -amount_cop end
  ), 0)
  into expected
  from public.cash_movements
  where cash_session_id = p_session_id and business_id = session_row.business_id;

  update public.cash_sessions
  set status = 'closed', closed_by = auth.uid(), closed_at = now(),
      closing_amount_cop = p_closing_amount_cop, expected_amount_cop = expected,
      difference_cop = p_closing_amount_cop - expected,
      notes = coalesce(nullif(trim(p_notes), ''), notes)
  where id = p_session_id
  returning * into session_row;

  return session_row;
end;
$$;

revoke all on function public.adjust_product_stock(uuid, text, integer, text, text) from public;
revoke all on function public.open_cash_session(uuid, bigint, text) from public;
revoke all on function public.record_cash_movement(uuid, text, bigint, text, uuid) from public;
revoke all on function public.close_cash_session(uuid, bigint, text) from public;
grant execute on function public.adjust_product_stock(uuid, text, integer, text, text) to authenticated;
grant execute on function public.open_cash_session(uuid, bigint, text) to authenticated;
grant execute on function public.record_cash_movement(uuid, text, bigint, text, uuid) to authenticated;
grant execute on function public.close_cash_session(uuid, bigint, text) to authenticated;
