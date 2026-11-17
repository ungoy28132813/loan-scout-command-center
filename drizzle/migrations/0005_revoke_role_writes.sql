revoke insert, update, delete, truncate on public.user_roles from authenticated, anon;
revoke insert, update, delete, truncate on public.audit_logs from authenticated, anon;
revoke all on public.user_roles, public.audit_logs from anon;