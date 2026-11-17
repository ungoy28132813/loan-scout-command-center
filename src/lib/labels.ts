export const DOC_CATEGORIES = [
  { value: "credit_reports", label: "Credit Reports" },
  { value: "identification", label: "Identification" },
  { value: "income", label: "Income" },
  { value: "banking", label: "Banking" },
  { value: "business_documents", label: "Business Documents" },
  { value: "other", label: "Other" },
] as const;
export const APP_STATUSES = [
  { value: "not_started", label: "Not Started" },
  { value: "submitted", label: "Submitted" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "denied", label: "Denied" },
] as const;
export const MATCH_STATUS_LABEL: Record<string, string> = {
  potential_match: "Potential Match",
  needs_review: "Needs Review",
  does_not_meet_published: "Doesn't Meet Published Requirements",
};
export const STAFF_ROLES = [
  { value: "credit_analyst", label: "Credit Analyst" },
  { value: "funding_specialist", label: "Funding Specialist" },
  { value: "client_manager", label: "Client Manager" },
  { value: "custom", label: "Custom" },
] as const;
export const PERMISSIONS = [
  ["can_upload_docs", "Upload documents"],
  ["can_edit_extractions", "Enter / correct report data"],
  ["can_run_matching", "Run matching"],
  ["can_approve_publish", "Approve & publish recommendations"],
  ["can_update_applications", "Update application statuses"],
  ["can_manage_readiness", "Manage funding-readiness tasks"],
  ["can_post_announcements", "Post client announcements"],
  ["can_export_pdf", "Export PDF strategies"],
  ["can_propose_rules", "Propose lender rules (owner approves)"],
] as const;
export const ROLE_PRESETS: Record<string, string[]> = {
  credit_analyst: ["can_upload_docs", "can_edit_extractions", "can_run_matching"],
  funding_specialist: ["can_upload_docs", "can_run_matching", "can_approve_publish", "can_update_applications", "can_export_pdf"],
  client_manager: ["can_upload_docs", "can_manage_readiness", "can_post_announcements", "can_update_applications"],
};
export const RULE_KEYS = [
  ["min_score", "Minimum credit score (bureau + model)"],
  ["max_inquiries", "Maximum inquiries in lookback"],
  ["max_dti_pct", "Maximum DTI %"],
  ["min_open_tradelines", "Minimum open tradelines"],
  ["min_months_since_bankruptcy", "Months since bankruptcy"],
  ["max_utilization_pct", "Max revolving utilization %"],
  ["min_months_in_business", "Min months in business"],
  ["min_annual_revenue", "Min annual business revenue"],
  ["min_annual_income", "Min annual income"],
  ["min_existing_product_months", "Qualifying existing product age (months)"],
  ["min_membership_months", "Credit union membership age (months)"],
  ["requires_direct_deposit", "Qualifying direct deposit required"],
  ["max_late_payments", "Maximum late payments in lookback"],
  ["max_delinquent_accounts", "Maximum currently delinquent accounts"],
  ["max_collections", "Maximum collections"],
  ["max_chargeoffs", "Maximum charge-offs"],
  ["min_banking_history_months", "Minimum banking history (months)"],
  ["min_average_monthly_deposits", "Minimum average monthly deposits"],
  ["min_owner_share_pct", "Minimum owner share %"],
  ["allowed_states", "Allowed location / residency states"],
] as const;
export const SCORE_MODELS = ["FICO 8", "FICO 9", "FICO 10", "FICO 10T", "FICO Bankcard 8", "FICO Auto 8", "FICO 2 (Experian)", "FICO 5 (Equifax)", "FICO 4 (TransUnion)", "VantageScore 3.0", "VantageScore 4.0"];
export const REPORT_FIELDS = [
  ["inquiries_30d", "Hard inquiries (30 days)"],
  ["inquiries_3mo", "Hard inquiries (3 mo)"],
  ["inquiries_6mo", "Hard inquiries (6 mo)"],
  ["inquiries_12mo", "Hard inquiries (12 mo)"],
  ["inquiries_24mo", "Hard inquiries (24 mo)"],
  ["open_tradelines", "Open tradelines"],
  ["utilization_pct", "Revolving utilization %"],
  ["late_30_count", "30-day late payments"],
  ["late_60_count", "60-day late payments"],
  ["late_90_count", "90-day late payments"],
  ["late_payments_24mo", "Late payments (24 mo)"],
  ["delinquent_accounts_count", "Currently delinquent accounts"],
  ["collections_count", "Collections"],
  ["chargeoffs_count", "Charge-offs"],
  ["bankruptcy_on_file", "Bankruptcy on file (1 = yes, 0 = no)"],
  ["months_since_bankruptcy", "Months since bankruptcy filing"],
] as const;
export const fmtMoney = (n: number | null | undefined) => n == null ? "Unknown" : `$${Number(n).toLocaleString()}`;
export const fmtDate = (s: string | null | undefined) => s ? new Date(s).toLocaleDateString() : "—";
