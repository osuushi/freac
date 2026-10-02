import type { ToolResult } from "./catalog.js";
import { matchQuality } from "./search-quality.js";

export function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
export interface SearchResult {
  tool: ToolResult;
  tier: number;
  score: number;
  explanation: string;
}
function match(tool: ToolResult, query: string): SearchResult | null {
  if (!query) return { tool, tier: 0, score: 0, explanation: "" };
  const name = normalize(tool.label);
  if (name === query) return { tool, tier: 0, score: 0, explanation: "" };
  const candidates: { value: string; alias: boolean; related: boolean }[] = [
    { value: tool.label, alias: false, related: false },
    ...(tool.aliases ?? []).map((value) => ({ value, alias: true, related: false })),
    ...(tool.related ?? []).map((value) => ({ value, alias: false, related: true })),
  ];
  const matches = candidates.flatMap(({ value, alias, related }) => {
    const normalized = normalize(value),
      q = matchQuality(query, normalized);
    if (q === null) return [];
    const tier = related ? 7 + q.tier : alias && normalized === query ? 1 : 2 + q.tier;
    return [
      {
        tool,
        tier,
        score: q.score,
        explanation: related ? `Related: ${value}` : alias ? `Also called ${value}` : "",
      },
    ];
  });
  return matches.sort((a, b) => a.tier - b.tier || a.score - b.score)[0] ?? null;
}
export function searchTools(tools: readonly ToolResult[], query: string): SearchResult[] {
  const normalized = normalize(query);
  return tools
    .flatMap((tool) => {
      const result = match(tool, normalized);
      return result ? [result] : [];
    })
    .sort(
      (a, b) =>
        Number(!!a.tool.unavailable) - Number(!!b.tool.unavailable) ||
        a.tier - b.tier ||
        a.score - b.score ||
        a.tool.label.localeCompare(b.tool.label) ||
        a.tool.id.localeCompare(b.tool.id),
    );
}
