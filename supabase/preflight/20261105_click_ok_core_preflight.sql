-- Read-only structural preflight for the existing CLICKOK Supabase project.
-- This script makes no schema or data changes. It fails closed on any mismatch.
do $preflight$
declare
  item text[];
  missing text[] := array[]::text[];
  required_columns text[][] := array[
    array['profiles','id','uuid'],
    array['profiles','display_name','text'],
    array['profiles','created_at','timestamp with time zone'],
    array['profiles','updated_at','timestamp with time zone'],
    array['businesses','id','uuid'],
    array['businesses','name','text'],
    array['businesses','slug','text'],
    array['businesses','currency','text'],
    array['businesses','created_at','timestamp with time zone'],
    array['memberships','business_id','uuid'],
    array['memberships','user_id','uuid'],
    array['memberships','role','USER-DEFINED'],
    array['memberships','active','boolean'],
    array['memberships','created_at','timestamp with time zone'],
    array['categories','id','uuid'],
    array['categories','business_id','uuid'],
    array['categories','name','text'],
    array['categories','sort_order','integer'],
    array['categories','active','boolean'],
    array['categories','created_at','timestamp with time zone'],
    array['products','id','uuid'],
    array['products','business_id','uuid'],
    array['products','category_id','uuid'],
    array['products','name','text'],
    array['products','description','text'],
    array['products','price_cop','integer'],
    array['products','available','boolean'],
    array['products','featured','boolean'],
    array['products','created_at','timestamp with time zone'],
    array['customers','id','uuid'],
    array['customers','business_id','uuid'],
    array['customers','full_name','text'],
    array['customers','phone','text'],
    array['customers','email','text'],
    array['customers','created_at','timestamp with time zone'],
    array['orders','id','uuid'],
    array['orders','business_id','uuid'],
    array['orders','customer_id','uuid'],
    array['orders','order_number','integer'],
    array['orders','customer_name','text'],
    array['orders','total_cop','integer'],
    array['orders','status','USER-DEFINED'],
    array['orders','created_at','timestamp with time zone'],
    array['orders','updated_at','timestamp with time zone'],
    array['order_status_history','id','bigint'],
    array['order_status_history','business_id','uuid'],
    array['order_status_history','order_id','uuid'],
    array['order_status_history','old_status','USER-DEFINED'],
    array['order_status_history','new_status','USER-DEFINED'],
    array['order_status_history','changed_by','uuid'],
    array['order_status_history','changed_at','timestamp with time zone']
  ];
  required_functions text[] := array[
    'is_business_member(uuid)',
    'has_business_role(uuid,business_role[])',
    'create_business(text,text)',
    'advance_order_status(uuid,order_status)',
    'record_order_status_history()',
    'set_updated_at()',
    'handle_new_auth_user()'
  ];
  required_triggers text[] := array[
    'orders_record_initial_status:orders',
    'orders_record_status_change:orders',
    'profiles_set_updated_at:profiles',
    'orders_set_updated_at:orders',
    'on_auth_user_created:users'
  ];
  required_policies text[] := array[
    'profiles:profiles_select_own',
    'profiles:profiles_update_own',
    'businesses:businesses_select_member',
    'memberships:memberships_select_self_or_owner',
    'categories:categories_select_member',
    'categories:categories_insert_manager',
    'categories:categories_update_manager',
    'categories:categories_delete_manager',
    'products:products_select_member',
    'products:products_insert_manager',
    'products:products_update_manager',
    'products:products_delete_manager',
    'customers:customers_select_member',
    'orders:orders_select_member',
    'orders:orders_update_operator',
    'order_status_history:order_history_select_member'
  ];
  t text;
begin
  foreach item slice 1 in array required_columns loop
    if not exists (
      select 1 from information_schema.columns c
      where c.table_schema='public' and c.table_name=item[1]
        and c.column_name=item[2] and c.data_type=item[3]
    ) then
      missing := array_append(missing, format('column %s.%s type %s', item[1], item[2], item[3]));
    end if;
  end loop;

  if not exists (select 1 from pg_type where typnamespace='public'::regnamespace and typname='business_role' and typtype='e') then
    missing := array_append(missing,'enum public.business_role');
  else
    foreach t in array array['owner','admin','editor','operator','sales','cashier','inventory','fulfillment'] loop
      if not exists (select 1 from pg_enum e join pg_type ty on ty.oid=e.enumtypid where ty.typnamespace='public'::regnamespace and ty.typname='business_role' and e.enumlabel=t) then
        missing := array_append(missing,'business_role value '||t);
      end if;
    end loop;
  end if;
  if not exists (select 1 from pg_type where typnamespace='public'::regnamespace and typname='order_status' and typtype='e') then
    missing := array_append(missing,'enum public.order_status');
  else
    foreach t in array array['pending','confirmed','preparing','ready','on_the_way','delivered','cancelled'] loop
      if not exists (select 1 from pg_enum e join pg_type ty on ty.oid=e.enumtypid where ty.typnamespace='public'::regnamespace and ty.typname='order_status' and e.enumlabel=t) then
        missing := array_append(missing,'order_status value '||t);
      end if;
    end loop;
  end if;

  foreach t in array required_functions loop
    if to_regprocedure('public.'||t) is null then missing := array_append(missing,'function public.'||t); end if;
  end loop;

  foreach t in array required_triggers loop
    if not exists (
      select 1 from pg_trigger tr
      join pg_class c on c.oid=tr.tgrelid
      join pg_namespace n on n.oid=c.relnamespace
      where n.nspname=case when split_part(t,':',2)='users' then 'auth' else 'public' end
        and c.relname=split_part(t,':',2)
        and tr.tgname=split_part(t,':',1) and not tr.tgisinternal
    ) then missing := array_append(missing,'trigger '||t); end if;
  end loop;

  foreach t in array required_policies loop
    if not exists (
      select 1 from pg_policies p
      where p.schemaname='public' and p.tablename=split_part(t,':',1)
        and p.policyname=split_part(t,':',2)
    ) then missing := array_append(missing,'policy '||t); end if;
  end loop;

  foreach t in array array['profiles','businesses','memberships','categories','products','customers','orders','order_status_history'] loop
    if not coalesce((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=t),false) then
      missing := array_append(missing,'RLS enabled on public.'||t);
    end if;
  end loop;

  if not has_table_privilege('authenticated','public.products','SELECT')
     or not has_table_privilege('authenticated','public.products','INSERT')
     or not has_table_privilege('authenticated','public.products','UPDATE')
     or not has_table_privilege('authenticated','public.products','DELETE') then
    missing := array_append(missing,'authenticated CRUD grants on products');
  end if;
  if not has_function_privilege('authenticated','public.create_business(text,text)','EXECUTE')
     or not has_function_privilege('authenticated','public.advance_order_status(uuid,order_status)','EXECUTE') then
    missing := array_append(missing,'authenticated execute grants on core RPCs');
  end if;

  if cardinality(missing)>0 then
    raise exception 'CLICK OK core preflight FAILED (%): %', cardinality(missing), array_to_string(missing,'; ');
  end if;
  raise notice 'CLICK OK core preflight PASSED: required columns, enums, functions, triggers, policies, RLS and core grants verified.';
end
$preflight$;
