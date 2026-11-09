-- Public storefront foundation for CLICK OK. Additive only; no existing records are changed.
create table if not exists public.business_public_pages (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  published boolean not null default false,
  template_key text not null default 'universal',
  theme jsonb not null default '{"primary":"#7656ed","background":"#ffffff","font":"DM Sans"}'::jsonb check (jsonb_typeof(theme)='object'),
  content jsonb not null default '{"hero_title":"","hero_description":"","sections":["catalog","about","contact"]}'::jsonb check (jsonb_typeof(content)='object'),
  contact jsonb not null default '{}'::jsonb check (jsonb_typeof(contact)='object'),
  seo jsonb not null default '{}'::jsonb check (jsonb_typeof(seo)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists business_public_pages_published_slug_idx on public.business_public_pages(slug) where published=true;
alter table public.business_public_pages enable row level security;
revoke all on public.business_public_pages from anon, authenticated;
grant select, insert, update on public.business_public_pages to authenticated;
drop policy if exists public_pages_member_read on public.business_public_pages;
create policy public_pages_member_read on public.business_public_pages for select to authenticated using (public.is_business_member(business_id));
drop policy if exists public_pages_manager_insert on public.business_public_pages;
create policy public_pages_manager_insert on public.business_public_pages for insert to authenticated with check (public.has_business_role(business_id, array['owner','admin']::public.business_role[]));
drop policy if exists public_pages_manager_update on public.business_public_pages;
create policy public_pages_manager_update on public.business_public_pages for update to authenticated using (public.has_business_role(business_id, array['owner','admin']::public.business_role[])) with check (public.has_business_role(business_id, array['owner','admin']::public.business_role[]));

-- Public access is intentionally mediated through this narrow RPC. It returns only
-- published storefront data and never exposes private business, customer, order or cash records.
create or replace function public.get_public_storefront(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'business', jsonb_build_object('id', b.id, 'name', b.name, 'business_type_id', b.business_type_id),
    'page', jsonb_build_object('slug', pp.slug, 'template_key', pp.template_key, 'theme', pp.theme, 'content', pp.content, 'contact', pp.contact, 'seo', pp.seo),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'sort_order', c.sort_order) order by c.sort_order)
      from public.categories c where c.business_id=b.id and c.active=true
    ), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'description', p.description, 'price_cop', p.price_cop, 'available', p.available, 'featured', p.featured, 'category_id', p.category_id) order by p.featured desc, p.created_at desc)
      from public.products p where p.business_id=b.id and p.available=true
    ), '[]'::jsonb)
  )
  from public.business_public_pages pp
  join public.businesses b on b.id=pp.business_id
  where pp.slug=p_slug and pp.published=true and b.status='active'
  limit 1;
$$;
revoke all on function public.get_public_storefront(text) from public, anon, authenticated;
grant execute on function public.get_public_storefront(text) to anon, authenticated;
comment on function public.get_public_storefront(text) is 'Returns only published public storefront presentation and available catalog records for a slug.';
