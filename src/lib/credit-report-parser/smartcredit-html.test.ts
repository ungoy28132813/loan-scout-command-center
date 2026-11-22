import { describe, expect, it } from "vitest";
import { parseSmartCreditClassicHtml } from "./smartcredit-html";

/** Entirely fictional credit-report data. Never place real client reports in GitHub. */
const bureauHeader = '<div class="grid grid-cols-4"><div></div><div>TransUnion</div><div>Experian</div><div>Equifax</div></div>';
const row = (label: string, tu: string, exp: string, eq: string) =>
  '<div class="grid grid-cols-4"><p>' + label + '</p><div>' + tu + '</div><div>' + exp + '</div><div>' + eq + '</div></div>';

const account = (creditor: string, extra = "") => '<div><div>' +
  '<div><h5>' + creditor + '</h5></div>' + bureauHeader +
  row("Account Number", "****1111", "****1111", "****1111") +
  row("Balance Owed", "$200", "$0", "—") +
  row("Date Opened", "01/02/2024", "01/02/2024", "—") +
  '<span data-test="late-30-transunion">0</span>' +
  '<span data-test="late-60-transunion">1</span>' +
  '<span data-test="late-90-transunion">0</span>' +
  extra + '</div></div>';

const section = (label: string, contents: string) =>
  '<div><div><h4>' + label + '</h4></div>' + contents + '</div>';

const synthetic = (overrides: {
  scores?: string; summary?: string; accounts?: string; inquiries?: string;
} = {}) => '<html><body><main>' +
  '<h1>3B Report &amp; VantageScore® 3.0 as of November 17, 2026</h1>' +
  '<div><h2>Credit Scores</h2><div>' + bureauHeader +
  (overrides.scores ?? row("", "721", "—", "744")) + '</div></div>' +
  '<div><h2>Summary</h2><p>Summary of report</p><div>' + bureauHeader +
  (overrides.summary ?? row("Open Accounts", "2", "0", "—")) + '</div></div>' +
  '<div><h2>Accounts</h2><div>' +
  (overrides.accounts ?? section("Revolving Accounts", account("ALPHA BANK") + account("ALPHA BANK"))) +
  '</div></div>' +
  '<div><h2>Inquiries</h2><p>Inquiries shown</p><div>' +
  (overrides.inquiries ?? '<div><div><span>DEMO LENDER</span><span>11/02/2026</span></div><div>TransUnion®</div></div>') +
  '</div></div>' +
  '</main></body></html>';

describe("SmartCredit Classic HTML source-structured parser (synthetic data)", () => {
  it("preserves bureau order and blank middle scores without shifting Equifax", () => {
    const r = parseSmartCreditClassicHtml(synthetic());
    expect(r.scores.map((s) => [s.bureau, s.score, s.model])).toEqual([
      ["transunion", 721, "VantageScore 3.0"],
      ["equifax", 744, "VantageScore 3.0"],
    ]);
    expect(r.scores.every((s) => s.needsReview)).toBe(true);
  });

  it("preserves explicit zero, missing bureau values and source evidence", () => {
    const r = parseSmartCreditClassicHtml(synthetic());
    const open = r.summary.find((x) => x.label === "Open Accounts")!;
    expect(open.cells.transunion?.raw).toBe("2");
    expect(open.cells.experian?.raw).toBe("0");
    expect(open.cells.equifax?.raw).toBeNull();
    expect(open.cells.experian?.source.column).toBe(2);
    expect(open.cells.experian?.needsReview).toBe(true);
  });

  it("preserves repeated creditor blocks instead of silently deduplicating", () => {
    const r = parseSmartCreditClassicHtml(synthetic());
    expect(r.accounts).toHaveLength(2);
    expect(r.accounts.map((a) => a.creditor)).toEqual(["ALPHA BANK", "ALPHA BANK"]);
    expect(r.accounts.map((a) => a.blockNumber)).toEqual([0, 1]);
    expect(r.accounts[0]?.rows.find((x) => x.label === "Balance Owed")?.cells.equifax?.raw).toBeNull();
  });

  it("reads exact per-bureau late-count markers without inferring payment-history months", () => {
    const r = parseSmartCreditClassicHtml(synthetic());
    expect(r.accounts[0]?.lateCounts.transunion?.late30?.raw).toBe("0");
    expect(r.accounts[0]?.lateCounts.transunion?.late60?.raw).toBe("1");
    expect(r.accounts[0]?.lateCounts.experian?.late30).toBeNull();
  });

  it("extracts dated inquiries without assuming a second bureau", () => {
    const r = parseSmartCreditClassicHtml(synthetic());
    expect(r.inquiries).toHaveLength(1);
    expect(r.inquiries[0]).toMatchObject({
      creditor: "DEMO LENDER",
      dateRaw: "11/02/2026",
      bureau: "transunion",
      needsReview: true,
    });
  });

  it("does not guess account fields when the bureau header is absent", () => {
    const noHeader = '<div><div><div><h5>ALPHA BANK</h5></div>' +
      row("Account Number", "****1111", "****1111", "****1111") +
      row("Balance Owed", "$200", "$0", "—") + '</div></div>';
    const r = parseSmartCreditClassicHtml(synthetic({
      accounts: section("Revolving Accounts", noHeader),
    }));
    expect(r.accounts[0]?.rows).toEqual([]);
    expect(r.warnings.some((x) => x.includes("missing unambiguous"))).toBe(true);
    expect(r.status).toBe("partial");
  });

  it("keeps missing score models unknown rather than inferring one", () => {
    const html = synthetic().replace("VantageScore® 3.0", "Scores");
    const r = parseSmartCreditClassicHtml(html);
    expect(r.scores.every((s) => s.model === null)).toBe(true);
  });

  it("does not execute scripts or append untrusted report DOM into the live app", () => {
    const html = synthetic() + '<script>window.__loanscout_untrusted_script = 1</script>';
    const r = parseSmartCreditClassicHtml(html);
    expect(r.scores.length).toBe(2);
    expect((window as unknown as Record<string, unknown>)["__loanscout_untrusted_script"]).toBeUndefined();
    expect(document.querySelector("h1")).toBeNull();
  });

  it("keeps all five real-layout account categories isolated and preserves every synthetic block", () => {
    // Matches the five section shapes/counts observed in the supplied HTML
    // without copying a single client account name or financial value.
    const categories: Array<[string, number]> = [
      ["Revolving Accounts", 11],
      ["Installment Accounts", 10],
      ["Other Accounts", 4],
      ["Line of Credit Accounts", 1],
      ["Collections Accounts", 1],
    ];
    const sections = categories.map(([name, count]) =>
      section(name, Array.from({ length: count }, (_, i) => account("FICTIONAL BANK " + i)).join(""))
    ).join("");
    const parsed = parseSmartCreditClassicHtml(synthetic({ accounts: sections }));
    expect(parsed.accounts).toHaveLength(27);
    for (const [name, count] of categories) {
      const matching = parsed.accounts.filter((x) => x.category === name);
      expect(matching).toHaveLength(count);
      expect(matching.map((x) => x.blockNumber)).toEqual(Array.from({ length: count }, (_, i) => i));
      expect(matching.every((x) => x.needsReview)).toBe(true);
    }
  });

  it("recognizes a mortgage account section without treating it as a revolving account", () => {
    const parsed = parseSmartCreditClassicHtml(synthetic({
      accounts: section("Mortgage Accounts", account("FICTIONAL MORTGAGE")),
    }));
    expect(parsed.accounts).toHaveLength(1);
    expect(parsed.accounts[0]?.category).toBe("Mortgage Accounts");
  });

  it("rejects unrelated HTML without falsely extracting data", () => {
    const r = parseSmartCreditClassicHtml('<html><body><main><h1>Other website</h1></main></body></html>');
    expect(r.status).toBe("unreadable");
    expect(r.scores).toEqual([]);
    expect(r.accounts).toEqual([]);
  });
});
