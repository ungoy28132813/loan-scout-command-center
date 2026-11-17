import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const seed = readFileSync("supabase/seed/lender_catalog_expansion_2026-11-17.sql", "utf8");
const rows = seed.split("\n").filter((line) => line.startsWith("  ('"));

describe("official product catalog expansion", () => {
  it("adds real product records idempotently without activating rules", () => {
    expect(rows).toHaveLength(43);
    expect(seed.match(/INSERT INTO/g)).toHaveLength(1);
    expect(seed).toContain("ON CONFLICT (lender_id, name) DO NOTHING");
    expect(seed).not.toMatch(/lender_rules|approve_active|approval_status|probabilit/i);
    expect(seed).not.toMatch(/'hard'/);
  });

  it("covers all six requested product categories with official HTTPS sources", () => {
    for (const type of ["credit_card", "personal_loan", "personal_line_of_credit", "business_credit_card", "business_loan", "business_line_of_credit"]) {
      expect(rows.some((row) => row.includes(`'${type}'`)), type).toBe(true);
    }
    expect(rows.every((row) => row.includes("'https://"))).toBe(true);
    expect(seed).toContain("DATE '2026-11-17'");
  });

  it("keeps My Chase Loan as a card feature and excludes unverified lender offers", () => {
    const chase = rows.find((row) => row.includes("My Chase Loan"))!;
    expect(chase).toContain("'credit_card_feature'");
    expect(chase).toContain("'available_credit'");
    expect(chase).toContain("Not a standalone personal loan");
    expect(seed).not.toMatch(/Fifth Third|Zions/);
  });

  it("does not convert interest rates, monthly fees, or examples into APR ranges", () => {
    const bofa = rows.find((row) => row.includes("Business Advantage Term Loan"))!;
    const amexLine = rows.find((row) => row.includes("American Express® Business Line of Credit"))!;
    const dollar = rows.find((row) => row.includes("Dollar Bank Personal Term Loan"))!;
    expect(bofa).toContain("not recorded as APR");
    expect(amexLine).toContain("not stored as APR");
    expect(dollar).toContain("not recorded as a complete APR range");
  });
});
