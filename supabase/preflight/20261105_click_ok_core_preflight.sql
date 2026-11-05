-- Read-only structural preflight for the existing CLICKOK Supabase project.
-- SELECT-only: safe to execute with Supabase CLI --read-only.
with
required_columns(table_name, column_name, data_type) as (
  values
    ('profiles','id','uuid'),
    ('profiles','display_name','text'),
    ('profiles','created_at','timestamp with time zone'),
    ('profiles','updated_at','timestamp with time zone'),
    ('businesses','id','uuid'),
    ('businesses','name','text'),
    ('businesses','slug','text'),
    ('businesses','currency','text'),
    ('businesses','created_at','timestamp with time zone'),
    ('memberships','business_id','uuid'),
    ('memberships','user_id','uuid'),
    ('memberships','role','USER-DEFINED'),
    ('memberships','active','boolean'),
    ('memberships','created_at','timestamp with time zone'),
    ('categories','id','uuid'),
    ('categories','business_id','uuid'),
    ('categories','name','text'),
    ('categories','sort_order','integer'),
    ('categories','active','boolean'),
    ('categories','created_at','timestamp with time zone'),
    ('products','id','uuid'),
    ('products','business_id','uuid'),
    ('products','category_id','uuid'),
    ('products','name','text'),
    ('products','description','text'),
    ('products','price_cop','integer'),
    ('products','available','boolean'),
    ('products','featured','boolean'),
    ('products','created_at','timestamp with time zone'),
    ('customers','id','uuid'),
    ('customers','business_id','uuid'),
    ('customers','full_name','text'),
    ('customers','phone','text'),
    ('customers','email','text'),
    ('customers','created_at','timestamp with time zone'),
    ('orders','id','uuid'),
    ('orders','business_id','uuid'),
    ('orders','customer_id','uuid'),
    ('orders','order_number','integer'),
    ('orders','customer_name','text'),
    ('orders','total_cop','integer'),
    ('orders','status','USER-DEFINED'),
    ('orders','created_at','timestamp with time zone'),
    ('orders','updated_at','timestamp with time zone'),
    ('order_status_history','id','bigint'),
    ('order_status_history','business_id','uuid'),
    ('order_status_history','order_id','uuid'),
    ('order_status_history','old_status','USER-DEFINED'),
    ('order_status_history','new_status','USER-DEFINED'),
    ('order_status_history','changed_by','uuid'),
    ('order_status_history','changed_at','timestamp with time zone')
),
required_enum_values(enum_name, enum_value) as (
  values
    ('business_role','owner'),('business_role','admin'),('business_role','editor'),
    ('business_role','operator'),('business_role','sales'),('business_role','cashier'),
    ('business_role','inventory'),('business_role','fulfillment'),
    ('order_status','pending'),('order_status','confirmed'),('order_status','preparing'),
    ('order_status','ready'),('order_status','on_the_way'),('order_status','delivered'),
    ('order_status','cancelled')
),
required_functions(signature) as (
  values
    ('is_business_member(uuid)'),
    ('has_business_role(uuid,business_role[])'),
    ('create_business(text,text)'),
    ('advance_order_status(uuid,order_status)'),
    ('record_order_status_history()'),
    ('set_updated_at()'),
    ('handle_new_auth_user()')
),
required_triggers(trigger_name, table_schema, table_name) as (
  values
    ('orders_record_initial_status','public','orders'),
    ('orders_record_status_change','public','orders'),
    ('profiles_set_updated_at','public','profiles'),
    ('orders_set_updated_at','public','orders'),
    ('on_auth_user_created','auth','users')
),
required_policies(table_name, policy_name) as (
  values
    ('profiles','profiles_select_own'),
    ('profiles','profiles_update_own'),
    ('businesses','businesses_select_member'),
    ('memberships','memberships_select_self_or_owner'),
    ('categories','categories_select_member'),
    ('categories','categories_insert_manager'),
    ('categories','categories_update_manager'),
    ('categories','categories_delete_manager'),
    ('products','products_select_member'),
    ('products','products_insert_manager'),
    ('products','products_update_manager'),
    ('products','products_delete_manager'),
    ('customers','customers_select_member'),
    ('orders','orders_select_member'),
    ('orders','orders_update_operator'),
    ('order_status_history','order_history_select_member')
),
required_rls(table_name) as (
  values ('profiles'),('businesses'),('memberships'),('categories'),
         ('products'),('customers'),('orders'),('order_status_history')
),
missing as (
  select format('column %s.%s type %s', r.table_name, r.column_name, r.data_type) as issue
  from required_columns r
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema='public' and c.table_name=r.table_name
      and c.column_name=r.column_name and c.data_type=r.data_type
  )
  union all
  select format('enum public.%s', e.enum_name)
  from (values ('business_role'),('order_status')) e(enum_name)
  where not exists (
    select 1 from pg_type t
    where t.typnamespace='public'::regnamespace and t.typname=e.enum_name and t.typtype='e'
  )
  union all
  select format('enum value %s.%s', r.enum_name, r.enum_value)
  from required_enum_values r
  where not exists (
    select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid
    where t.typnamespace='public'::regnamespace and t.typname=r.enum_name
      and e.enumlabel=r.enum_value
  )
  union all
  select 'function public.' || f.signature
  from required_functions f
  where to_regprocedure('public.' || f.signature) is null
  union all
  select format('trigger %s on %s.%s', r.trigger_name, r.table_schema, r.table_name)
  from required_triggers r
  where not exists (
    select 1 from pg_trigger tr
    join pg_class c on c.oid=tr.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname=r.table_schema and c.relname=r.table_name
      and tr.tgname=r.trigger_name and not tr.tgisinternal
  )
  union all
  select format('policy %s.%s', r.table_name, r.policy_name)
  from required_policies r
  where not exists (
    select 1 from pg_policies p
    where p.schemaname='public' and p.tablename=r.table_name
      and p.policyname=r.policy_name
  )
  union all
  select 'RLS enabled on public.' || r.table_name
  from required_rls r
  where not coalesce((
    select c.relrowsecurity from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname=r.table_name
  ),false)
  union all
  select 'authenticated CRUD grants on products'
  where not (
    has_table_privilege('authenticated','public.products','SELECT')
    and has_table_privilege('authenticated','public.products','INSERT')
    and has_table_privilege('authenticated','public.products','UPDATE')
    and has_table_privilege('authenticated','public.products','DELETE')
  )
  union all
  select 'authenticated execute grants on core RPCs'
  where not (
    has_function_privilege('authenticated','public.create_business(text,text)','EXECUTE')
    and has_function_privilege('authenticated','public.advance_order_status(uuid,order_status)','EXECUTE')
  )
)
select case
  when count(*) = 0 then 'PASS: CLICK OK core schema checks passed'
  else 'FAIL: ' || string_agg(issue, '; ' order by issue)
end as preflight_result
from missing;
