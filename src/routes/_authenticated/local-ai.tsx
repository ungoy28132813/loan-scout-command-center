import { createFileRoute } from "@tanstack/react-router";
import { LocalAiWorkspace, localAiQuery } from "@/components/LocalAiWorkspace";

export const Route = createFileRoute("/_authenticated/local-ai")({
  head: () => ({ meta: [
    { title: "Local AI Intelligence — Loan Scout Matching Tool" },
    { name: "description", content: "Owner-reviewed local Ollama analysis of public lender sources and privacy-gated verified outcomes." },
    { property: "og:title", content: "Local AI Intelligence — Loan Scout" },
    { property: "og:description", content: "Private owner workspace for advisory public-source AI review." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" },
  ] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(localAiQuery),
  component: LocalAiWorkspace,
});