-- Prevent direct stock edits from bypassing the inventory ledger.
-- Apply after 202611050002_click_ok_operations.sql.

revoke update on public.products from authenticated;
grant update (category_id, name, description, price_cop, available, featured)
  on public.products to authenticated;

create or replace function public.configure_product_inventory(
  p_product_id uuid,
  p_track_inventory boolean,
  p_initial_stock integer default 0,
  p_low_stock_threshold integer default 0
)
returns public.products
language plpgsql
security definer
set search_path = ''
as $$
declare
  product_row public.products;
  previous_stock integer;
begin
  if auth.uid() is null
    or p_track_inventory is null
    or p_initial_stock is null or p_initial_stock < 0 or p_initial_stock > 1000000
    or p_low_stock_threshold is null or p_low_stock_threshold < 0 or p_low_stock_threshold > 1000000 then
    raise exception 'Invalid inventory configuration' using errcode = '22023';
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

  previous_stock := product_row.stock_quantity;
  update public.products
  set track_inventory = p_track_inventory,
      stock_quantity = case when p_track_inventory then p_initial_stock else stock_quantity end,
      low_stock_threshold = p_low_stock_threshold
  where id = p_product_id
  returning * into product_row;

  if p_track_inventory and previous_stock is distinct from p_initial_stock then
    insert into public.inventory_movements (
      business_id, product_id, movement_type, quantity,
      stock_before, stock_after, note, reference_type, created_by
    ) values (
      product_row.business_id, product_row.id, 'adjustment',
      greatest(abs(p_initial_stock - previous_stock), 1),
      previous_stock, p_initial_stock, 'Initial inventory configuration',
      'correction', auth.uid()
    );
  end if;

  return product_row;
end;
$$;

revoke all on function public.configure_product_inventory(uuid, boolean, integer, integer) from public;
grant execute on function public.configure_product_inventory(uuid, boolean, integer, integer) to authenticated;
