-- Read-only preflight: verify prerequisites and current product permissions before migration 003.
select
  to_regprocedure('public.has_business_role(uuid,public.business_role[])') is not null as has_business_role_helper,
  to_regtype('public.business_role') is not null as has_business_role_enum,
  to_regprocedure('public.configure_product_inventory(uuid,boolean,integer,integer)') is not null as inventory_configuration_function_already_exists,
  has_table_privilege('authenticated', 'public.products', 'UPDATE') as authenticated_has_table_update,
  has_column_privilege('authenticated', 'public.products', 'name', 'UPDATE') as can_update_name,
  has_column_privilege('authenticated', 'public.products', 'description', 'UPDATE') as can_update_description,
  has_column_privilege('authenticated', 'public.products', 'price_cop', 'UPDATE') as can_update_price,
  has_column_privilege('authenticated', 'public.products', 'track_inventory', 'UPDATE') as can_directly_update_track_inventory,
  has_column_privilege('authenticated', 'public.products', 'stock_quantity', 'UPDATE') as can_directly_update_stock,
  has_column_privilege('authenticated', 'public.products', 'low_stock_threshold', 'UPDATE') as can_directly_update_threshold;
