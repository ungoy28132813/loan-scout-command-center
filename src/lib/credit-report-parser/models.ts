/** Score model detection. Models are never inferred or substituted; unstated stays null. */
const MODELS: [RegExp, string][] = [
  [/fico\s*bankcard\s*score\s*8|fico\s*bankcard\s*8/i, "FICO Bankcard 8"],
  [/fico\s*auto\s*score\s*8|fico\s*auto\s*8/i, "FICO Auto 8"],
  [/fico\s*(?:score\s*)?10\s*t\b/i, "FICO 10T"],
  [/fico\s*(?:score\s*)?10\b/i, "FICO 10"],
  [/fico\s*(?:score\s*)?9\b/i, "FICO 9"],
  [/fico\s*(?:score\s*)?8\b/i, "FICO 8"],
  [/fico\s*(?:score\s*)?5\b/i, "FICO 5 (Equifax)"],
  [/fico\s*(?:score\s*)?4\b/i, "FICO 4 (TransUnion)"],
  [/fico\s*(?:score\s*)?2\b/i, "FICO 2 (Experian)"],
  [/vantage\s?score\s*(?:®\s*)?(?:v\s*)?3(?:\.0)?\b/i, "VantageScore 3.0"],
  [/vantage\s?score\s*(?:®\s*)?(?:v\s*)?4(?:\.0)?\b/i, "VantageScore 4.0"],
];

export type ModelHit = { model: string | null; vague: boolean } | null;

/** Returns the explicit model on a line; `vague` when a family is named without a version. */
export function modelIn(line: string): ModelHit {
  for (const [re, m] of MODELS) if (re.test(line)) return { model: m, vague: false };
  if (/vantage\s?score|\bfico\b/i.test(line)) return { model: null, vague: true };
  return null;
}
