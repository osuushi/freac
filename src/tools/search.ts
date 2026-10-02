import type { ToolResult } from "./catalog.js";

export function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
function editDistance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + Number(a[i - 1] !== b[j - 1]));
    row = next;
  }
  return row[b.length];
}
function fuzzy(query: string, value: string): number | null {
  if (query.length < 2) return null;
  const edits = editDistance(query, value);
  if (query.length >= 3 && edits <= (query.length >= 6 ? 2 : 1)) return edits;
  let position = 0,
    first = -1;
  for (const char of query) {
    const index = value.indexOf(char, position);
    if (index < 0) return null;
    if (first < 0) first = index;
    position = index + 1;
  }
  // Every query character must match in order; gaps affect rank, not eligibility.
  return 3 + position - first - query.length;
}
function quality(query: string, value: string): number | null {
  const words = value.split(" ");
  let score = 0;
  for (const token of query.split(" ")) {
    const matches = words.flatMap((word) => {
      if (word.startsWith(token)) return [word === token ? 0 : 1];
      const distance = fuzzy(token, word);
      return distance === null ? [] : [10 + distance];
    });
    const acrossWords = fuzzy(token, value);
    if (acrossWords !== null) matches.push(10 + acrossWords);
    if (!matches.length) return null;
    score += Math.min(...matches);
  }
  return score;
}
export interface SearchResult {
  tool: ToolResult;
  score: number;
  explanation: string;
}
function match(tool: ToolResult, query: string): SearchResult | null {
  if (!query) return { tool, score: 0, explanation: "" };
  const name = normalize(tool.label);
  if (name === query) return { tool, score: 0, explanation: "" };
  const candidates: { value: string; alias: boolean; related: boolean }[] = [
    { value: tool.label, alias: false, related: false },
    ...(tool.aliases ?? []).map((value) => ({ value, alias: true, related: false })),
    ...(tool.related ?? []).map((value) => ({ value, alias: false, related: true })),
  ];
  const matches = candidates.flatMap(({ value, alias, related }) => {
    const normalized = normalize(value),
      q = quality(query, normalized);
    if (q === null) return [];
    const score = related
      ? 400 + q
      : alias && normalized === query
        ? 100
        : q < 10
          ? 200 + q
          : 300 + q;
    return [
      {
        tool,
        score,
        explanation: related ? `Related: ${value}` : alias ? `Also called ${value}` : "",
      },
    ];
  });
  return matches.sort((a, b) => a.score - b.score)[0] ?? null;
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
        a.score - b.score ||
        a.tool.label.localeCompare(b.tool.label) ||
        a.tool.id.localeCompare(b.tool.id),
    );
}
