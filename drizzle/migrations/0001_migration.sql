
create policy "client-docs read" on storage.objects for select to authenticated
  using (bucket_id = 'client-documents' and public.can_access_client(auth.uid(), ((storage.foldername(name))[1])::uuid)
         and exists (select 1 from public.documents d where d.storage_path = name));
create policy "client-docs upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'client-documents' and (
    public.is_client_self(auth.uid(), ((storage.foldername(name))[1])::uuid)
    or (public.is_client_staff(auth.uid(), ((storage.foldername(name))[1])::uuid) and public.has_perm(auth.uid(),'can_upload_docs'))));
create policy "client-docs owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'client-documents' and public.is_owner(auth.uid()));
