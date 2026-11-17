create or replace function public.has_client_consent(_uid uuid, _cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (select count(distinct kind) from public.consents where user_id = _uid and client_id = _cid
          and kind in ('privacy_notice','report_analysis_authorization')) = 2
$$;
revoke execute on function public.has_client_consent(uuid, uuid) from public, anon;
grant execute on function public.has_client_consent(uuid, uuid) to authenticated;

drop policy if exists "upload docs" on public.documents;
create policy "upload docs" on public.documents for insert to authenticated with check (
  uploaded_by = auth.uid() and (
    (public.is_client_self(auth.uid(), client_id) and public.has_client_consent(auth.uid(), client_id))
    or (public.is_client_staff(auth.uid(), client_id) and public.has_perm(auth.uid(),'can_upload_docs'))));

drop policy if exists "client-docs upload" on storage.objects;
create policy "client-docs upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'client-documents' and (
    (public.is_client_self(auth.uid(), ((storage.foldername(name))[1])::uuid) and public.has_client_consent(auth.uid(), ((storage.foldername(name))[1])::uuid))
    or (public.is_client_staff(auth.uid(), ((storage.foldername(name))[1])::uuid) and public.has_perm(auth.uid(),'can_upload_docs'))));