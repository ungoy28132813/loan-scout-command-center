import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/benchmark-diagnosis")({
  server: { handlers: { POST: async ({ request }) => {
    const { diagnoseBenchmark } = await import("@/lib/benchmark-diagnosis.server");
    return diagnoseBenchmark(request);
  } } },
});