-- CLICK OK multipurpose SaaS foundation, phase 1.
-- Additive migration: preserves existing business and operational records.

create table if not exists public.business_types (
  id text primary key,
  name text not null unique,
  description text,
  active boolean not null default true,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now()
);

insert into public.business_types (id, name, description, sort_order)
values
  ('restaurant', 'Restaurante', 'Restaurantes, cafeterías y negocios gastronómicos', 10),
  ('retail', 'Tienda y comercio', 'Tiendas físicas, virtuales y comercios minoristas', 20),
  ('barber', 'Barbería y belleza', 'Barberías, peluquerías y centros de belleza', 30),
  ('services', 'Servicios', 'Servicios profesionales y negocios por cita u orden de trabajo', 40),
  ('general', 'Otro negocio', 'Negocios que utilizan herramientas generales de gestión', 90)
on conflict (id) do update
set name = excluded.name, description = excluded.description, sort_order = excluded.sort_order;

alter table public.businesses
  add column if not exists business_type_id text references public.business_types(id) on update cascade on delete restrict,
  add column if not exists status text not null default 'active' check (status in ('active', 'trial', 'suspended', 'archived')),
  add column if not exists timezone text not null default 'America/Bogota',
  add column if not exists updated_at timestamptz not null default now();

create index if not exists businesses_type_status_idx on public.businesses (business_type_id, status);

create table if not exists public.business_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.module_catalog (
  id text primary key,
  name text not null unique,
  description text,
  category text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (id ~ '^[a-z][a-z0-9_]*$')
);

insert into public.module_catalog (id, name, description, category)
values
  ('dashboard', 'Panel principal', 'Indicadores y actividad del negocio', 'core'),
  ('customers', 'Clientes', 'Gestión de clientes y contactos', 'core'),
  ('catalog', 'Catálogo', 'Productos, servicios y categorías', 'core'),
  ('sales', 'Ventas y POS', 'Registro de ventas y transacciones', 'core'),
  ('inventory', 'Inventario', 'Existencias y movimientos', 'operations'),
  ('cash', 'Caja', 'Aperturas, cierres e ingresos y egresos', 'operations'),
  ('reports', 'Reportes', 'Indicadores y exportaciones', 'management'),
  ('orders', 'Pedidos', 'Recepción y seguimiento de pedidos', 'restaurant'),
  ('tables', 'Mesas', 'Control de mesas y cuentas', 'restaurant'),
  ('kitchen', 'Cocina', 'Comandas y preparación', 'restaurant'),
  ('deliveries', 'Domicilios', 'Asignación y seguimiento de entregas', 'restaurant'),
  ('appointments', 'Citas y agenda', 'Reservas, citas y disponibilidad', 'services'),
  ('employees', 'Empleados', 'Equipo de trabajo y asignaciones', 'management'),
  ('suppliers', 'Proveedores', 'Proveedores y compras', 'operations')
on conflict (id) do update
set name = excluded.name, description = excluded.description, category = excluded.category;

create table if not exists public.business_modules (
  business_id uuid not null references public.businesses(id) on delete cascade,
  module_id text not null references public.module_catalog(id) on update cascade on delete restrict,
  enabled boolean not null default false,
  configuration jsonb not null default '{}'::jsonb check (jsonb_typeof(configuration) = 'object'),
  enabled_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (business_id, module_id)
);

create index if not exists business_modules_module_enabled_idx on public.business_modules (module_id, enabled);

alter table public.business_types enable row level security;
alter table public.module_catalog enable row level security;
alter table public.business_settings enable row level security;
alter table public.business_modules enable row level security;

revoke all on public.business_types, public.module_catalog, public.business_settings, public.business_modules from anon, authenticated;
grant select on public.business_types, public.module_catalog to authenticated;
grant select on public.business_settings, public.business_modules to authenticated;
grant insert, update on public.business_settings to authenticated;

drop policy if exists business_types_read_active on public.business_types;
create policy business_types_read_active on public.business_types for select to authenticated using (active);

drop policy if exists module_catalog_read_active on public.module_catalog;
create policy module_catalog_read_active on public.module_catalog for select to authenticated using (active);

drop policy if exists business_settings_select_member on public.business_settings;
create policy business_settings_select_member on public.business_settings for select to authenticated using (public.is_business_member(business_id));

drop policy if exists business_settings_insert_manager on public.business_settings;
create policy business_settings_insert_manager on public.business_settings for insert to authenticated
with check (public.has_business_role(business_id, array['owner', 'admin']::public.business_role[]));

drop policy if exists business_settings_update_manager on public.business_settings;
create policy business_settings_update_manager on public.business_settings for update to authenticated
using (public.has_business_role(business_id, array['owner', 'admin']::public.business_role[]))
with check (public.has_business_role(business_id, array['owner', 'admin']::public.business_role[]));

drop policy if exists business_modules_select_member on public.business_modules;
create policy business_modules_select_member on public.business_modules for select to authenticated using (public.is_business_member(business_id));

comment on column public.businesses.business_type_id is 'Business vertical selected by the business owner; nullable for existing businesses until classified.';
comment on column public.businesses.status is 'Platform lifecycle status, controlled by authorized platform administration.';
comment on table public.business_modules is 'Per-business module entitlements; tenant users may read but cannot grant themselves modules.';
comment on table public.business_settings is 'Tenant-specific configuration stored separately from platform configuration.';
