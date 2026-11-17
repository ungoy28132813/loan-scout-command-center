CREATE OR REPLACE FUNCTION public.guard_business_profile_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $function$
begin
  if (new.business_credit_score is not null or new.business_credit_model is not null) and (new.business_credit_source_url is null or new.business_credit_verified_on is null) then
    raise exception 'Business credit information requires a source URL and source date';
  end if;
  if not public.is_client_staff(auth.uid(), new.client_id) then
    if tg_op = 'INSERT' and (new.verification_status <> 'self_reported' or new.financial_source <> 'self_reported' or new.verified_by is not null or new.verified_at is not null) then
      raise exception 'Clients cannot self-verify business financial information';
    end if;
    if tg_op = 'UPDATE' and (new.verification_status is distinct from old.verification_status or new.financial_source is distinct from old.financial_source or new.verified_by is distinct from old.verified_by or new.verified_at is distinct from old.verified_at) then
      raise exception 'Only assigned staff can change business verification or provenance';
    end if;
    if tg_op = 'UPDATE' and (new.formation_date is distinct from old.formation_date or new.lifecycle_status is distinct from old.lifecycle_status or new.months_in_business is distinct from old.months_in_business or new.annual_revenue is distinct from old.annual_revenue or new.monthly_revenue is distinct from old.monthly_revenue or new.monthly_net_cash_flow is distinct from old.monthly_net_cash_flow or new.monthly_expenses is distinct from old.monthly_expenses or new.existing_monthly_debt_payments is distinct from old.existing_monthly_debt_payments or new.banking_history_months is distinct from old.banking_history_months or new.average_monthly_deposits is distinct from old.average_monthly_deposits or new.owner_share_pct is distinct from old.owner_share_pct or new.business_credit_score is distinct from old.business_credit_score or new.business_credit_model is distinct from old.business_credit_model or new.business_credit_source_url is distinct from old.business_credit_source_url or new.business_credit_verified_on is distinct from old.business_credit_verified_on) then
      new.verification_status := 'self_reported'; new.financial_source := 'self_reported'; new.verified_by := null; new.verified_at := null;
    end if;
  elsif tg_op = 'INSERT' or new.verification_status is distinct from old.verification_status then
    if new.verification_status = 'verified' then new.verified_by := auth.uid(); new.verified_at := now(); end if;
  end if;
  if new.verification_status <> 'verified' then new.verified_by := null; new.verified_at := null; end if;
  new.updated_at := now();
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.guard_business_answer_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $function$
begin
  if not exists (select 1 from public.business_profiles b where b.id=new.business_profile_id and b.client_id=new.client_id) then raise exception 'Business answer belongs to a different client'; end if;
  if not public.is_client_staff(auth.uid(),new.client_id) and (new.verified or new.financial_source <> 'self_reported') then raise exception 'Clients cannot self-verify business answers'; end if;
  new.answered_by := auth.uid();
  new.updated_at := now();
  return new;
end $function$;