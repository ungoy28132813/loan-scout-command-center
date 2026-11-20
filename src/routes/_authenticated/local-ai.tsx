import { createFileRoute } from "@tanstack/react-router";
import { LocalAiWorkspace, localAiQuery } from "@/components/LocalAiWorkspace";
import { benchmarkDiagnosisQuery } from "@/components/BenchmarkDiagnostics";

export const Route = createFileRoute("/_authenticated/local-ai")({
  head: () => ({ meta: [
    { title: "Local AI Intelligence — Loan Scout Matching Tool" },
    { name: "description", content: "Owner-reviewed Ollama lender research and privacy-filtered benchmark diagnosis with saved recovery outcomes." },
    { property: "og:title", content: "Local AI Intelligence — Loan Scout" },
    { property: "og:description", content: "Private Loan Scout workspace for lender research, benchmark diagnosis and guided recovery." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" },
  ] }),
  loader: async ({ context }) => { await Promise.all([context.queryClient.ensureQueryData(localAiQuery), context.queryClient.ensureQueryData(benchmarkDiagnosisQuery)]); },
  component: LocalAiWorkspace,
});