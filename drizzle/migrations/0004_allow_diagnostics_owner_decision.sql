grant execute on function public.bootstrap_role_decision(text, boolean) to service_role;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'supabase_read_only_user') then
    execute 'grant execute on function public.bootstrap_role_decision(text, boolean) to supabase_read_only_user';
  end if;
end $$;