-- Allow authenticated users to read only businesses permitted by the existing businesses_select_member RLS policy.
grant select on table public.businesses to authenticated;
