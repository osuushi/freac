export interface MatchQuality {
  // Literal prefix, word prefixes, anchored subsequence, subsequence, typo.
  tier: number;
  score: number;
}

const wordStartBonus = 8;
const firstCharacterMultiplier = 2;
const consecutiveBonus = 4;
const gapOpeningPenalty = 3;
const gapExtensionPenalty = 1;

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

// Independently implemented scoring: reward word starts and consecutive matches;
// charge for opening/extending gaps. See the fzf reference in docs/design/tool-menu.md.
function subsequence(query: string, value: string, anchored: boolean): number | null {
  const pattern = Array.from(query),
    text = Array.from(value);
  if (pattern.length < 2 || pattern.length > text.length) return null;
  const boundary = text.map((_, i) => (i === 0 || text[i - 1] === " " ? wordStartBonus : 0));
  let previous = text.map((char, i) =>
    char === pattern[0] && (!anchored || i === 0)
      ? boundary[i] * firstCharacterMultiplier
      : -Infinity,
  );
  for (const char of pattern.slice(1)) {
    const next = Array<number>(text.length).fill(-Infinity);
    let gap = -Infinity;
    for (let i = 1; i < text.length; i++) {
      if (i >= 2) gap = Math.max(gap - gapExtensionPenalty, previous[i - 2] - gapOpeningPenalty);
      if (text[i] === char)
        next[i] = Math.max(previous[i - 1] + consecutiveBonus, gap) + boundary[i];
    }
    previous = next;
  }
  const best = Math.max(...previous);
  return Number.isFinite(best) ? -best : null;
}

function tokenQuality(token: string, value: string): MatchQuality | null {
  if (value.startsWith(token)) return { tier: 0, score: value.length - token.length };
  const words = value.split(" ");
  const prefixes = words.flatMap((word, index) =>
    word.startsWith(token) ? [index + word.length - token.length] : [],
  );
  if (prefixes.length) return { tier: 1, score: Math.min(...prefixes) };
  const anchored = subsequence(token, value, true);
  if (anchored !== null) return { tier: 2, score: anchored };
  const fuzzy = subsequence(token, value, false);
  if (fuzzy !== null) return { tier: 3, score: fuzzy };
  if (token.length < 3) return null;
  const edits = Math.min(...words.map((word) => editDistance(token, word)));
  return edits <= (token.length >= 6 ? 2 : 1) ? { tier: 4, score: edits } : null;
}

export function matchQuality(query: string, value: string): MatchQuality | null {
  if (value.startsWith(query)) return { tier: 0, score: value.length - query.length };
  const result = { tier: 1, score: 0 };
  for (const token of query.split(" ")) {
    const quality = tokenQuality(token, value);
    if (!quality) return null;
    result.tier = Math.max(result.tier, quality.tier);
    result.score += quality.score;
  }
  return result;
}
