/**
 * REPLACEABLE LOGO SLOT.
 * The original, owner-approved Loan Scout LLC logo must be placed here UNCHANGED.
 * It has not been uploaded yet, so this renders a clearly labeled placeholder — no logo is generated or imitated.
 * To install: add the original file to src/assets (e.g. loan-scout-logo.svg) and set LOGO_SRC to its import.
 */
const LOGO_SRC: string | null = null;

export function Logo({ compact = false, inverted = false }: { compact?: boolean; inverted?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      {LOGO_SRC ? (
        <img src={LOGO_SRC} alt="Loan Scout LLC" className={compact ? "h-8 w-auto" : "h-11 w-auto"} />
      ) : (
        <div
          role="img"
          aria-label="Loan Scout LLC logo placeholder — original logo pending upload"
          title="Original Loan Scout LLC logo pending upload"
          className={`flex shrink-0 items-center justify-center rounded border-2 border-dashed px-2 text-center leading-tight ${inverted ? "border-sidebar-primary text-sidebar-primary" : "border-primary text-primary"} ${compact ? "h-9 w-20" : "h-12 w-28"}`}
        >
          <span className="label-caps text-[0.55rem]">Logo pending<br />upload</span>
        </div>
      )}
      {!compact && (
        <div className="leading-none">
          <div className={`label-caps ${inverted ? "text-sidebar-foreground/70" : "text-muted-foreground"}`}>Loan Scout LLC</div>
          <div className={`font-display text-2xl ${inverted ? "text-sidebar-primary" : "text-primary"}`}>Matching Tool</div>
        </div>
      )}
    </div>
  );
}
