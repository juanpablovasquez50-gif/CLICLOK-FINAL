-- Public storefront checkout: atomically persist orders in the existing CLICK OK order workflow.
alter table public.orders
  add column if not exists customer_phone text,
  add column if not exists delivery_method text not null default 'pickup'
    check (delivery_method in ('pickup','delivery')),
  add column if not exists delivery_address text,
  add column if not exists payment_method text,
  add column if not exists customer_notes text;

alter table public.order_items
  add column if not exists options jsonb not null default '[]'::jsonb;

create or replace function public.create_public_storefront_order(
  p_slug text,
  p_customer_name text,
  p_customer_phone text,
  p_delivery_method text,
  p_delivery_address text,
  p_payment_method text,
  p_customer_notes text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  page_row public.business_public_pages;
  customer_row public.customers;
  order_row public.orders;
  item jsonb;
  product_row public.products;
  item_quantity integer;
  computed_total bigint := 0;
begin
  if p_slug is null or char_length(trim(p_slug)) not between 2 and 60
    or p_customer_name is null or char_length(trim(p_customer_name)) not between 2 and 160
    or p_customer_phone is null or char_length(regexp_replace(p_customer_phone, '[^0-9]', '', 'g')) not between 7 and 20
    or p_delivery_method is null or p_delivery_method not in ('pickup','delivery')
    or (p_delivery_method = 'delivery' and (p_delivery_address is null or char_length(trim(p_delivery_address)) not between 5 and 300))
    or (p_payment_method is not null and char_length(trim(p_payment_method)) > 80)
    or (p_customer_notes is not null and char_length(p_customer_notes) > 1000)
    or p_items is null
    or case
      when jsonb_typeof(p_items) = 'array'
        then jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 50
      else true
    end then
    raise exception 'Invalid order details' using errcode = '22023';
  end if;

  select * into page_row
  from public.business_public_pages p
  where p.slug = lower(trim(p_slug)) and p.published = true
  limit 1;

  if not found then
    raise exception 'Storefront is not available' using errcode = 'P0002';
  end if;

  select * into customer_row
  from public.customers c
  where c.business_id = page_row.business_id
    and regexp_replace(coalesce(c.phone,''), '[^0-9]', '', 'g') =
        regexp_replace(p_customer_phone, '[^0-9]', '', 'g')
  order by c.created_at desc
  limit 1;

  if not found then
    insert into public.customers(business_id, full_name, phone)
    values (page_row.business_id, trim(p_customer_name), trim(p_customer_phone))
    returning * into customer_row;
  else
    update public.customers
      set full_name = trim(p_customer_name), phone = trim(p_customer_phone)
    where id = customer_row.id
    returning * into customer_row;
  end if;

  -- Validate products and calculate all prices on the server, never trusting browser totals.
  for item in select value from jsonb_array_elements(p_items)
  loop
    if (item->>'product_id') is null
      or (item->>'product_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or (item->>'quantity') is null
      or (item->>'quantity') !~ '^[0-9]{1,6}$'
      or (item ? 'options' and case
        when jsonb_typeof(item->'options') = 'array'
          then jsonb_array_length(item->'options') > 20
        else true
      end) then
      raise exception 'Invalid order item' using errcode = '22023';
    end if;

    item_quantity := (item->>'quantity')::integer;
    if item_quantity < 1 or item_quantity > 1000000 then
      raise exception 'Invalid item quantity' using errcode = '22023';
    end if;

    select * into product_row
    from public.products p
    where p.id = (item->>'product_id')::uuid
      and p.business_id = page_row.business_id
      and p.available = true
    for share;

    if not found then
      raise exception 'A product is no longer available' using errcode = '22023';
    end if;

    computed_total := computed_total + (product_row.price_cop::bigint * item_quantity::bigint);
  end loop;

  if computed_total > 2000000000 then
    raise exception 'Order total exceeds the allowed limit' using errcode = '22023';
  end if;

  insert into public.orders(
    business_id, customer_id, customer_name, total_cop,
    customer_phone, delivery_method, delivery_address, payment_method, customer_notes
  ) values (
    page_row.business_id, customer_row.id, trim(p_customer_name), computed_total::integer,
    trim(p_customer_phone), p_delivery_method,
    case when p_delivery_method = 'delivery' then trim(p_delivery_address) else null end,
    nullif(trim(coalesce(p_payment_method,'')), ''),
    nullif(trim(coalesce(p_customer_notes,'')), '')
  ) returning * into order_row;

  for item in select value from jsonb_array_elements(p_items)
  loop
    select * into product_row
    from public.products p
    where p.id = (item->>'product_id')::uuid
      and p.business_id = page_row.business_id
      and p.available = true;

    insert into public.order_items(
      business_id, order_id, product_id, product_name, quantity,
      unit_price_cop, line_total_cop, options
    ) values (
      page_row.business_id, order_row.id, product_row.id, product_row.name,
      (item->>'quantity')::integer, product_row.price_cop,
      product_row.price_cop::bigint * (item->>'quantity')::integer,
      coalesce(item->'options', '[]'::jsonb)
    );
  end loop;

  return jsonb_build_object(
    'order_id', order_row.id,
    'order_number', order_row.order_number,
    'total_cop', order_row.total_cop,
    'status', order_row.status
  );
end;
$$;

revoke all on function public.create_public_storefront_order(text,text,text,text,text,text,text,jsonb) from public, authenticated;
grant execute on function public.create_public_storefront_order(text,text,text,text,text,text,text,jsonb) to anon, authenticated;
