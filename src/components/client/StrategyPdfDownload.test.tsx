import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrategyPdfDownload } from "./StrategyPdfDownload";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  generate: vi.fn(),
  deliver: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/lib/download", () => ({ deliverFile: mocks.deliver }));
vi.mock("sonner", () => ({ toast: { error: mocks.error, success: mocks.success } }));
vi.mock("@/lib/strategy-pdf", () => ({
  generateStrategyPdf: mocks.generate,
  strategyFilename: (_name: string, version: number) => `strategy-v${version}.pdf`,
}));

const payload = (snapshotId: string, version: number) => ({
  snapshot_id: snapshotId,
  version,
  client_name: "Synthetic test client",
  published_at: null,
  content: { items: [], disclaimer: "Synthetic test only" },
});

describe("StrategyPdfDownload snapshot isolation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.generate.mockResolvedValue(new Blob(["synthetic test PDF"], { type: "application/pdf" }));
    mocks.deliver.mockResolvedValue(undefined);
  });
  afterEach(cleanup);

  it("discards a prepared download when the selected snapshot changes", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: payload("snapshot-a", 1), error: null });
    const view = render(<StrategyPdfDownload snapshotId="snapshot-a" version={1} />);
    fireEvent.click(screen.getByRole("button", { name: "Prepare PDF v1" }));
    await screen.findByRole("button", { name: "Download PDF" });
    view.rerender(<StrategyPdfDownload snapshotId="snapshot-b" version={2} />);
    expect(screen.queryByRole("button", { name: "Download PDF" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prepare PDF v2" })).toBeEnabled();
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it("rejects an export response for a different snapshot or version", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: payload("snapshot-b", 1), error: null });
    render(<StrategyPdfDownload snapshotId="snapshot-a" version={1} />);
    fireEvent.click(screen.getByRole("button", { name: "Prepare PDF v1" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Download PDF" })).not.toBeInTheDocument();
  });

  it("rejects the wrong version even when the snapshot ID matches", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: payload("snapshot-a", 2), error: null });
    render(<StrategyPdfDownload snapshotId="snapshot-a" version={1} />);
    fireEvent.click(screen.getByRole("button", { name: "Prepare PDF v1" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("does not prepare a file when the export RPC denies access", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: new Error("forbidden") });
    render(<StrategyPdfDownload snapshotId="snapshot-a" version={1} />);
    fireEvent.click(screen.getByRole("button", { name: "Prepare PDF v1" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("forbidden"));
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Download PDF" })).not.toBeInTheDocument();
  });

  it("delivers only a successfully prepared matching export", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: payload("snapshot-a", 1), error: null });
    render(<StrategyPdfDownload snapshotId="snapshot-a" version={1} />);
    fireEvent.click(screen.getByRole("button", { name: "Prepare PDF v1" }));
    fireEvent.click(await screen.findByRole("button", { name: "Download PDF" }));
    expect(mocks.rpc).toHaveBeenCalledWith("prepare_strategy_export", { _snapshot_id: "snapshot-a" });
    expect(mocks.deliver).toHaveBeenCalledWith(expect.any(Blob), "strategy-v1.pdf");
  });
});
