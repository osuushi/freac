import assert from "node:assert/strict";
import test from "node:test";
import type { ToolResult } from "../src/tools/catalog.js";
import { searchTools } from "../src/tools/search.js";

function tool(id: string, label: string, extra: Partial<ToolResult> = {}): ToolResult {
  return {
    id,
    label,
    category: "Solid",
    unavailable: null,
    reason: () => null,
    run: () => {},
    ...extra,
  };
}
const shell = tool("shell", "Shell", { aliases: ["thickness", "hollow"] });
test("canonical, aliases, prefixes, typos and abbreviations find tools", () => {
  for (const query of ["shell", "thickness", "THÍCKNESS", "thick", "shel", "shll"])
    assert.equal(searchTools([shell], query)[0]?.tool.id, "shell", query);
  assert.equal(searchTools([tool("rectangle", "Rectangle")], "recatngle")[0]?.tool.id, "rectangle");
});
test("availability dominates even an exact disabled name", () => {
  const results = searchTools(
    [
      tool("shell", "Shell", { unavailable: "Select a body" }),
      tool("related", "Offset", { related: ["shell"] }),
    ],
    "shell",
  );
  assert.deepEqual(
    results.map((r) => r.tool.id),
    ["related", "shell"],
  );
});
test("canonical then alias then prefix then fuzzy then related", () => {
  const tools = [
    tool("related", "E", { related: ["shell"] }),
    tool("fuzzy", "Shel"),
    tool("prefix", "Shell body"),
    tool("alias", "Hollow", { aliases: ["shell"] }),
    shell,
  ];
  assert.deepEqual(
    searchTools(tools, "shell").map((r) => r.tool.id),
    ["shell", "alias", "prefix", "fuzzy", "related"],
  );
});
test("multiword queries require all words; unrelated query stays empty", () => {
  const tools = [tool("offset", "Offset faces"), shell];
  assert.equal(searchTools(tools, "faces off")[0]?.tool.id, "offset");
  assert.deepEqual(searchTools(tools, "offset banana"), []);
  assert.deepEqual(searchTools(tools, "unrecognizable"), []);
});
test("empty queries and ties have stable available-first ordering", () => {
  const tools = [
    tool("z", "Same"),
    tool("a", "Same"),
    tool("disabled", "A", { unavailable: "Not here" }),
  ];
  assert.deepEqual(
    searchTools(tools, "").map((r) => r.tool.id),
    ["a", "z", "disabled"],
  );
  assert.deepEqual(
    searchTools([...tools].reverse(), "").map((r) => r.tool.id),
    ["a", "z", "disabled"],
  );
});
test("all disabled matches are retained without a result cap", () => {
  const tools = Array.from({ length: 75 }, (_, i) =>
    tool(`t${i}`, `Shell ${i}`, { unavailable: "Select geometry" }),
  );
  assert.equal(searchTools(tools, "shell").length, 75);
});
