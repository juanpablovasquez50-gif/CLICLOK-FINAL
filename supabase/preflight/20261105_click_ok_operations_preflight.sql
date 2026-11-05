-- Read-only readiness check before CLICK OK operations migrations.
-- Reports which operational objects already exist; applies no changes.
with required_core(table_name, column_name, data_type) as (
  values
    ('businesses','id','uuid'),
    ('memberships','business_id','uuid'),
    ('products','id','uuid'),
    ('products','business_id','uuid'),
    ('orders','id','uuid'),
    ('orders','business_id','uuid')
),
core_missing as (
  select format('MISSING core column public.%s.%s (%s)', r.table_name, r.column_name, r.data_type) as result
  from required_core r
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema='public' and c.table_name=r.table_name
      and c.column_name=r.column_name and c.data_type=r.data_type
  )
),
ops_tables(table_name) as (
  values ('order_items'),('inventory_movements'),('cash_sessions'),('cash_movements')
),
ops_columns(table_name,column_name,data_type) as (
  values
    ('order_items','id','uuid'),('order_items','business_id','uuid'),
    ('order_items','order_id','uuid'),('order_items','product_id','uuid'),
    ('order_items','product_name','text'),('order_items','quantity','integer'),
    ('order_items','unit_price_cop','integer'),('order_items','line_total_cop','bigint'),
    ('inventory_movements','id','uuid'),('inventory_movements','business_id','uuid'),
    ('inventory_movements','product_id','uuid'),('inventory_movements','movement_type','text'),
    ('inventory_movements','quantity','integer'),('inventory_movements','stock_before','integer'),
    ('inventory_movements','stock_after','integer'),
    ('cash_sessions','id','uuid'),('cash_sessions','business_id','uuid'),
    ('cash_sessions','opened_by','uuid'),('cash_sessions','status','text'),
    ('cash_sessions','opening_amount_cop','bigint'),
    ('cash_movements','id','uuid'),('cash_movements','business_id','uuid'),
    ('cash_movements','cash_session_id','uuid'),('cash_movements','movement_type','text'),
    ('cash_movements','amount_cop','bigint')
),
existing_ops as (
  select format('EXISTS operational table public.%s', t.table_name) as result
  from ops_tables t
  where to_regclass('public.'||t.table_name) is not null
),
partial_ops as (
  select format('REVIEW existing table public.%s missing or mismatched column %s (%s)',
    r.table_name,r.column_name,r.data_type) as result
  from ops_columns r
  where to_regclass('public.'||r.table_name) is not null
    and not exists (
      select 1 from information_schema.columns c
      where c.table_schema='public' and c.table_name=r.table_name
        and c.column_name=r.column_name and c.data_type=r.data_type
    )
),
product_column_state as (
  select case
    when count(*) filter (where column_name in ('track_inventory','stock_quantity','low_stock_threshold')) = 0
      then 'READY product inventory columns are absent and can be added'
    when count(*) filter (where column_name in ('track_inventory','stock_quantity','low_stock_threshold')) = 3
      and bool_and(
        (column_name='track_inventory' and data_type='boolean')
        or (column_name in ('stock_quantity','low_stock_threshold') and data_type='integer')
      )
      then 'EXISTS all product inventory columns with expected types'
    else 'REVIEW product inventory columns are partially present or have unexpected types'
  end as result
  from information_schema.columns
  where table_schema='public' and table_name='products'
    and column_name in ('track_inventory','stock_quantity','low_stock_threshold')
)
select result from (
  select result from core_missing
  union all select result from existing_ops
  union all select result from partial_ops
  union all select result from product_column_state
  union all
  select case when not exists (select 1 from core_missing)
    then 'PASS core prerequisites found' else 'FAIL core prerequisites missing' end
) checks
order by result;
