CREATE OR REPLACE FUNCTION public.auto_confirm_report_row() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN RETURN NEW; END; $$;
CREATE OR REPLACE FUNCTION public.auto_confirm_report_status() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN RETURN NEW; END; $$;
CREATE OR REPLACE FUNCTION public.auto_confirm_report_update() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF NOT public.is_client_staff(auth.uid(),NEW.client_id) AND NEW.extraction_status='verified' THEN RAISE EXCEPTION 'Only authorized staff may verify report evidence'; END IF;
 RETURN NEW; END; $$;
DO $migration$ DECLARE definition text; BEGIN
 definition:=pg_get_functiondef('public.auto_accept_client_submission()'::regprocedure);
 IF position('No owner impersonation' in coalesce(obj_description('public.auto_accept_client_submission()'::regprocedure,'pg_proc'),''))=0 THEN RAISE EXCEPTION 'Expected validated automatic import implementation'; END IF;
 definition:=replace(definition,'''Automatic client read confirmed by owner policy; not human reviewed''','''Automatically received client read; unverified until staff review''');
 definition:=replace(definition,$old$extraction_status='verified'$old$,$new$extraction_status='complete_unverified'$new$);
 definition:=replace(definition,$old$review_status='accepted',reviewed_by=NULL$old$,$new$review_status='imported',reviewed_by=NULL$new$);
 EXECUTE definition;
 END; $migration$;
CREATE OR REPLACE FUNCTION public.is_client_staff(_uid uuid,_cid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT (_uid=auth.uid() OR public.is_owner(auth.uid())) AND (public.is_owner(_uid) OR (public.has_role(_uid,'employee') AND EXISTS(SELECT 1 FROM public.client_assignments a WHERE a.client_id=_cid AND a.employee_id=_uid AND a.active AND (a.temporary_until IS NULL OR a.temporary_until>now())))) $$;
CREATE OR REPLACE FUNCTION public.is_client_self(_uid uuid,_cid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT (_uid=auth.uid() OR public.is_owner(auth.uid())) AND EXISTS(SELECT 1 FROM public.clients c JOIN public.profiles p ON p.id=c.user_id WHERE c.id=_cid AND c.user_id=_uid AND p.active) $$;
CREATE OR REPLACE FUNCTION public.can_read_profile(_viewer uuid,_profile uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT (_viewer=auth.uid() OR public.is_owner(auth.uid())) AND (_viewer=_profile OR public.is_owner(_viewer) OR EXISTS(SELECT 1 FROM public.clients c WHERE c.user_id=_profile AND public.is_client_staff(_viewer,c.id))) $$;
REVOKE EXECUTE ON FUNCTION public.auto_confirm_report_row(),public.auto_confirm_report_status(),public.auto_confirm_report_update() FROM PUBLIC,anon,authenticated;