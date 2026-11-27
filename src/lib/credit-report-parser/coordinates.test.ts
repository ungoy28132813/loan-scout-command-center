import { describe, expect, it } from "vitest";
import { classifyCellColor, money, monthRow, parseCoordinates, type PosItem, type PosPage } from "./coordinates";

const item = (str: string, x: number, y: number): PosItem => ({ str, x, y, w: Math.max(5, str.length * 5) });
const row = (y: number, entries: [string, number][]): PosItem[] => entries.map(([str, x]) => item(str, x, y));
const headers = (y: number, order: [string, string, string] = ["TransUnion", "Experian", "Equifax"]) => row(y, [[order[0], 220], [order[1], 350], [order[2], 480]]);
const page = (items: PosItem[]): PosPage => ({ page: 1, width: 612, height: 792, items });

function syntheticClassic(): PosPage[] {
  return [page([
    item("SmartCredit Classic 3B Report", 40, 790),
    item("Credit Scores", 40, 740),
    ...headers(720),
    ...row(700, [["701", 220], ["702", 350], ["703", 480]]),
    item("VantageScore 3.0", 40, 680),
    item("Personal Information", 40, 660),
    ...headers(640),
    ...row(620, [["Name", 40], ["SYNTHETIC PERSON", 220], ["SYNTHETIC PERSON", 350], ["SYNTHETIC PERSON", 480]]),
    ...row(600, [["Credit Report Date", 40], ["06/15/2026", 220], ["06/15/2026", 350], ["06/15/2026", 480]]),
    item("Summary", 40, 570),
    ...headers(550),
    ...row(530, [["Total Accounts", 40], ["1", 220], ["1", 350], ["1", 480]]),
    ...row(510, [["Open Accounts", 40], ["1", 220], ["1", 350], ["1", 480]]),
    ...row(490, [["Closed Accounts", 40], ["0", 220], ["0", 350], ["0", 480]]),
    ...row(470, [["Delinquent", 40], ["0", 220], ["0", 350], ["0", 480]]),
    ...row(450, [["Inquiries (2 Years)", 40], ["1", 220], ["0", 350], ["0", 480]]),
    item("Revolving Accounts", 40, 410),
    item("SYNTHETIC BANK", 40, 390),
    ...headers(370),
    ...row(350, [["Account Number", 40], ["****1111", 220], ["****1111", 350], ["****1111", 480]]),
    ...row(330, [["Balance Owed", 40], ["$", 205], ["1,234", 225], ["$", 335], ["2,000", 355], ["$", 465], ["3,000", 485]]),
    ...row(310, [["Credit Limit", 40], ["$", 205], ["5,000", 225], ["$", 335], ["6,000", 355], ["$", 465], ["7,000", 485]]),
    ...row(290, [["Account Status", 40], ["Open", 220], ["Open", 350], ["Open", 480]]),
    ...row(270, [["Account Type", 40], ["Credit Card", 220], ["Credit Card", 350], ["Credit Card", 480]]),
    item("Inquiries", 40, 220),
    item("We found 1 inquiries in the past 2 years", 40, 200),
    ...row(180, [["01/01/2026", 40], ["SYNTHETIC BANK", 120], ["TransUnion", 350]]),
  ])];
}

describe("SmartCredit coordinate reader", () => {
  it("maps scores by printed bureau order rather than fixed positions", () => {
    const parsed = parseCoordinates([page([
      item("SmartCredit Classic 3B Report", 40, 790),
      item("Credit Scores", 40, 740),
      ...headers(720, ["Experian", "TransUnion", "Equifax"]),
      ...row(700, [["701", 220], ["702", 350], ["703", 480]]),
      item("Personal Information", 40, 660),
    ])]);
    expect(parsed.scores).toEqual({ transunion: 702, experian: 701, equifax: 703 });
    expect(parsed.warnings.join(" ")).toMatch(/out of SmartCredit order/);
  });

  it("reads the report date, exact model, summary, split dollars and reconciled inquiries", () => {
    const parsed = parseCoordinates(syntheticClassic());
    expect(parsed.recognized).toBe(true);
    expect(parsed.variant).toBe("classic_3b");
    expect(parsed.scoreModel).toBe("VantageScore 3.0");
    expect(parsed.personal.reportDate.transunion).toBe("2026-06-15");
    expect(parsed.tradelines).toHaveLength(1);
    expect(parsed.tradelines[0]?.fields["Balance Owed"]?.transunion).toBe("$1,234");
    expect(parsed.tradelines[0]?.fields["Credit Limit"]?.equifax).toBe("$7,000");
    expect(parsed.inquiryAudit).toMatchObject({ headerCount: 1, pass: true, mismatches: [] });
    expect(parsed.inquiries).toHaveLength(1);
  });

  it("assigns January year labels and keeps neutral or dark pixels unknown", () => {
    const cells = monthRow(row(100, [["Dec", 40], ["'26", 70], ["Feb", 100]]), 1, 100);
    expect(cells.map((cell) => cell.month)).toEqual(["2025-12", "2026-01", "2026-02"]);
    expect(classifyCellColor(255, 255, 255)).toBeNull();
    expect(classifyCellColor(20, 20, 20)).toBeNull();
    expect(classifyCellColor(70, 190, 110)).toBe("OK");
  });

  it("preserves visible name gaps and captures current address and birth year", () => {
    const parsed = parseCoordinates([page([
      item("SmartCredit Classic 3B Report", 40, 790),
      item("Credit Scores", 40, 740),
      item("Personal Information", 40, 720),
      ...headers(700),
      ...row(680, [["Name", 40]]),
      { str: "SYNTHETIC", x: 220, y: 680, w: 45 },
      { str: "PERSON", x: 267.05, y: 680, w: 30 },
      ...row(680, [["SYNTHETIC PERSON", 350], ["SYNTHETIC PERSON", 480]]),
      ...row(660, [["Current Address", 40], ["123 TEST ST, SAMPLE CITY, FL", 220], ["123 TEST ST, SAMPLE CITY, FL", 350], ["123 TEST ST, SAMPLE CITY, FL", 480]]),
      ...row(640, [["347727885", 220], ["347727885", 350], ["347727885", 480]]),
      ...row(620, [["Date of Birth", 40], ["1996", 220], ["1996", 350], ["1996", 480]]),
    ])]);
    expect(parsed.personal.name.transunion).toBe("SYNTHETIC PERSON");
    expect(parsed.personal.currentAddresses.transunion).toEqual(["123 TEST ST, SAMPLE CITY, FL 347727885"]);
    expect(parsed.personal.birthYear).toEqual({ transunion: 1996, experian: 1996, equifax: 1996 });
  });

  it("splits multi-line previous addresses at ZIP and ZIP+4 boundaries", () => {
    const parsed = parseCoordinates([page([
      item("SmartCredit Classic 3B Report", 40, 790),
      item("Credit Scores", 40, 740),
      item("Personal Information", 40, 720),
      ...headers(700),
      ...row(680, [["Previous Address", 40], ["123 TEST ST, SAMPLE CITY, FL", 220], ["NONE REPORTED", 350], ["NONE REPORTED", 480]]),
      ...row(660, [["347727885", 220], ["--", 350], ["--", 480]]),
      ...row(640, [["456 EXAMPLE RD, OTHER CITY, NC 27106-2422", 220], ["--", 350], ["--", 480]]),
    ])]);
    expect(parsed.personal.previousAddresses.transunion).toEqual([
      "123 TEST ST, SAMPLE CITY, FL 347727885",
      "456 EXAMPLE RD, OTHER CITY, NC 27106-2422",
    ]);
  });

  it("normalizes the SmartCredit ff ligature without changing charge-off meaning", () => {
    const parsed = parseCoordinates([page([
      item("SmartCredit Classic 3B Report", 40, 790),
      item("Credit Scores", 40, 740),
      item("Personal Information", 40, 720),
      item("Summary", 40, 710),
      item("Collections Accounts", 40, 700),
      item("SYNTHETIC COLLECTION", 40, 680),
      ...headers(660),
      ...row(640, [["Account Number", 40], ["****1111", 220], ["****1111", 350], ["****1111", 480]]),
      ...row(620, [["Payment Status", 40], ["Collection/Chargeo!", 220], ["Charged o!as bad debt", 350], ["Profit and loss write-o!", 480]]),
    ])]);
    expect(parsed.tradelines[0]?.fields["Payment Status"]).toEqual({
      transunion: "Collection/Chargeoff",
      experian: "Charged off as bad debt",
      equifax: "Profit and loss write-off",
    });
  });

  it("parses dollars as dollars and rejects malformed money", () => {
    expect(money("$378,038")).toBe(378038);
    expect(money("$0.50")).toBe(0.5);
    expect(money("$12.34.56")).toBeNull();
    expect(money("--")).toBeNull();
  });
});
