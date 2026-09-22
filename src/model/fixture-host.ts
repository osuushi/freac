export interface CapturedFixture {
  path: string;
  name: string;
  contents: string;
}

declare global {
  interface Window {
    freacFixtureFile?: { drag(): void; reveal(): void };
    freacFixture?: (snapshot: unknown) => Promise<CapturedFixture>;
  }
}

/** Desktop and paired browsers save through the host; local web development uses Vite. */
export async function saveFixture(snapshot: unknown): Promise<CapturedFixture> {
  if (window.freacFixture) return window.freacFixture(snapshot);
  const response = await fetch("/__freac_fixture", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(snapshot),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}
