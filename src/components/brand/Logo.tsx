/**
 * Official owner-approved Loan Scout LLC logo (original raster, unchanged) at /loan-scout-approved-logo.webp.
 * Never regenerate, redraw or recolor it. The source has a white background, so it always sits on a
 * white mark holder, which keeps it legible on dark surfaces. "MATCHING TOOL" is a separate subtitle.
 */
const LOGO_SRC = "/loan-scout-approved-logo.webp";

export function Logo({ compact = false, inverted = false }: { compact?: boolean; inverted?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="shrink-0 rounded-md bg-[#FFFFFF] p-1 shadow-sm ring-1 ring-border/40 print:shadow-none">
        <img
          src={LOGO_SRC}
          alt="Loan Scout LLC"
          width={400}
          height={244}
          className={`${compact ? "h-8" : "h-12"} w-auto object-contain`}
          draggable={false}
        />
      </div>
      {!compact && (
        <div className={`font-display text-2xl leading-none tracking-wide ${inverted ? "text-sidebar-primary" : "text-primary"}`}>
          Matching Tool
        </div>
      )}
    </div>
  );
}
