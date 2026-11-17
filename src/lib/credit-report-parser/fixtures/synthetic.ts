/**
 * SYNTHETIC test fixtures only — invented people, creditors and numbers. Not real client data.
 * Layouts imitate common text-layer patterns; they are not copies of any provider's report.
 */
import type { PageText } from "../types";
const pg = (page: number, text: string): PageText => ({ page, lines: text.split("\n") });

export const singleBureauExperian: PageText[] = [pg(1, `DEMO Consumer Report — SYNTHETIC
Experian Credit Report
Report Date: 10/02/2026
Name: Jane Synthetic
SSN: 123-45-6789
FICO Score 8: 702
Score Date: 10/01/2026
Inquiries (last 6 months): 2
Open Accounts: 5
Collections: 0`), pg(2, `Accounts
DEMO BANK CARD
Account #: 4111222233334444
Account Type: Revolving
Balance: $1,200
Credit Limit: $5,000
Account Status: Open`)];

export const triMergeIdentityIQ: PageText[] = [pg(1, `IdentityIQ 3-Bureau Credit Report (SYNTHETIC DEMO)
Report Date: 11/01/2026
TransUnion   Experian   Equifax
FICO Score 8
Credit Score:   690   701   --
Inquiries (last 12 months):   3   2   4
Open Accounts:   7   7   6
Utilization:   34%   31%   36%`), pg(3, `TransUnion   Experian   Equifax
SAMPLE AUTO FINANCE
Account #:   55551111XXXX9876   55551111XXXX9876   55551111XXXX9876
Account Type:   Installment   Installment   Installment
Balance:   $8,400   $8,400   $8,350
Credit Limit:   --   --   --
Account Status:   Open   Open   Open`)];

export const ficoVsVantage: PageText[] = [pg(1, `SmartCredit (SYNTHETIC)
TransUnion   Experian   Equifax
VantageScore 3.0
Credit Score:   655   662   649
See how your FICO scores may differ — learn more about FICO
Equifax FICO Score 9: 671`)];

export const marketingVantageOnly: PageText[] = [pg(1, `MyScoreIQ (SYNTHETIC)
Your VantageScore is shown below.
TransUnion   Experian   Equifax
Credit Score:   640   645   650
Monitor your credit with alerts every day across all bureaus.`)];

export const missingScore: PageText[] = [pg(1, `Equifax Credit File (SYNTHETIC)
Report Date: 09/15/2026
Credit Score: Not Reported
Inquiries (last 6 months): 1
Open Accounts: 3`)];

export const scannedNoText: PageText[] = [{ page: 1, lines: [] }, { page: 2, lines: [" "] }];

export const sameNameAccounts: PageText[] = [pg(1, `TransUnion Credit Report (SYNTHETIC)
TransUnion
DEMO CREDIT UNION
Account #: XXXXXXXX1111
Balance: $300
Account Status: Open
DEMO CREDIT UNION
Account #: XXXXXXXX2222
Balance: $900
Account Status: Closed
DEMO CREDIT UNION
Account #: XXXXXXXX
Balance: $50
Account Status: Collection`)];

export const datedEvidence: PageText[] = [pg(1, `IdentityIQ 3-Bureau Credit Report (SYNTHETIC)
Report Date: 11/01/2026
TransUnion   Experian   Equifax
FICO Score 8
Credit Score:   690   701   705
Inquiries (last 6 months):   4   1   0
30 Day Late Payments:   1   0   0
60 Day Late Payments:   0   0   0
90 Day Late Payments:   0   0   0
Collections:   1   0   0
Charge-offs:   1   0   0
Bankruptcy On File:   Yes   No   --
Bankruptcy Filed Date:   01/15/2024   --   --`), pg(2, `TransUnion
Inquiries
10/15/2026 DEMO BANK
10/15/2026 DEMO BANK
08/15/2026 DEMO CARD
05/15/2026 DEMO AUTO
11/15/2025 DEMO BANK
11/15/2024 DEMO BANK
Accounts
TransUnion   Experian   Equifax
DEMO CARD
Account #: XXXXXXXX1111   XXXXXXXX1111   XXXXXXXX1111
Account Type:   Revolving   Revolving   Revolving
Balance:   $1,200   $1,200   $1,200
Credit Limit:   $5,000   $5,000   $5,000
30 Day Lates:   1   0   0
60 Day Lates:   0   0   0
90 Day Lates:   0   0   0
Account Status:   Open   Open   Open`)];

export const chargeoffEvidence: PageText[] = [pg(1, `Experian Credit Report (SYNTHETIC)
Report Date: 10/01/2026
DEMO RECOVERY
Account #: XXXXXXXX2222
Account Type: Other
Balance: $450
Late Payments: 2
Account Status: Charge-off`)];

export const duplicateBureauAccount: PageText[] = [pg(1, `TransUnion Credit Report (SYNTHETIC)
TransUnion
DEMO BANK
Account #: XXXXXXXX1111
Balance: $100
DEMO BANK
Account #: XXXXXXXX1111
Balance: $100`)];

export const unreadableOcr: PageText[] = [{ page: 1, lines: [" "] }];
