-- Trigger-only SECURITY DEFINER functions must never be callable through PostgREST RPC.
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
revoke all on function public.record_order_status_history() from public, anon, authenticated;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
