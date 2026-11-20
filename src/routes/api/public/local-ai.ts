import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/local-ai")({
  server: { handlers: { POST: async ({ request }) => {
    const { exchangeLocalWorker } = await import("@/lib/local-ai-worker.server");
    return exchangeLocalWorker(request);
  } } },
});