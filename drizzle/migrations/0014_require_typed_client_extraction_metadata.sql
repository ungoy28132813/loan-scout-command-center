CREATE OR REPLACE FUNCTION public.validate_client_extraction_required(_payload jsonb)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_catalog
AS $function$
declare item jsonb; item_count int;
begin
  if not (_payload ? 'status') or not (_payload ? 'pageCount') or not (_payload ? 'hasTextLayer') or not (_payload ? 'scores') or not (_payload ? 'fields') or not (_payload ? 'tradelines') then raise exception 'Missing required extraction metadata'; end if;
  if jsonb_typeof(_payload->'status') <> 'string' then raise exception 'Extraction status must be text'; end if;
  if jsonb_typeof(_payload->'scores') <> 'array' or jsonb_typeof(_payload->'fields') <> 'array' or jsonb_typeof(_payload->'tradelines') <> 'array' then raise exception 'Extraction collections must be arrays'; end if;
  for item in select value from jsonb_array_elements(_payload->'scores') loop
    if not (item ? 'bureau') or not (item ? 'value') or not (item ? 'sourcePage') or not (item ? 'confidence') or not (item ? 'needsReview') then raise exception 'Missing required score data'; end if;
    if jsonb_typeof(item->'bureau') <> 'string' or jsonb_typeof(item->'confidence') <> 'string' then raise exception 'Score bureau and confidence must be text'; end if;
  end loop;
  for item in select value from jsonb_array_elements(_payload->'fields') loop
    if not (item ? 'bureau') or not (item ? 'key') or not (item ? 'value') or not (item ? 'sourcePage') or not (item ? 'confidence') or not (item ? 'needsReview') then raise exception 'Missing required field data'; end if;
    if jsonb_typeof(item->'bureau') <> 'string' or jsonb_typeof(item->'key') <> 'string' or jsonb_typeof(item->'confidence') <> 'string' then raise exception 'Field bureau, key and confidence must be text'; end if;
  end loop;
  for item in select value from jsonb_array_elements(_payload->'tradelines') loop
    if not (item ? 'bureau') or not (item ? 'creditor') or not (item ? 'isCollection') or not (item ? 'sourcePage') or not (item ? 'needsReview') then raise exception 'Missing required tradeline data'; end if;
    if jsonb_typeof(item->'bureau') <> 'string' or jsonb_typeof(item->'creditor') <> 'string' then raise exception 'Tradeline bureau and creditor must be text'; end if;
  end loop;
  item_count := jsonb_array_length(_payload->'scores') + jsonb_array_length(_payload->'fields') + jsonb_array_length(_payload->'tradelines');
  if _payload->>'status' in ('unreadable','awaiting_manual_entry') and item_count <> 0 then raise exception 'Unreadable or empty reads cannot contain extracted values'; end if;
  if _payload->>'status' in ('partial','complete_unverified') and item_count = 0 then raise exception 'A populated extraction status requires at least one structured value'; end if;
  if _payload->>'status' = 'unreadable' and (_payload->>'hasTextLayer')::boolean then raise exception 'Unreadable reports cannot claim a text layer'; end if;
end
$function$;
REVOKE ALL ON FUNCTION public.validate_client_extraction_required(jsonb) FROM PUBLIC, anon, authenticated;