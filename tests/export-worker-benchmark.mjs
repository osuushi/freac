/** Serialized by Playwright into an isolated browser page. Includes worker startup and transport. */
export async function measureExportWorkers({ scenario, previewPath, exportPath }) {
  const { default: PreviewWorker } = await import(previewPath);
  const { default: ExportWorker } = await import(exportPath);
  const results = [];
  for (const [kind, WorkerClass] of [
    ["preview", PreviewWorker],
    ["export", ExportWorker],
    ["native-export", ExportWorker],
  ]) {
    for (const temperature of ["cold", "warm"]) {
      const start = performance.now(),
        worker = new WorkerClass();
      let timer,
        integrationMs = 0;
      try {
        const data = await new Promise((resolve, reject) => {
          timer = setTimeout(() => reject(new Error(`${kind} exceeded 120 seconds`)), 120000);
          worker.onmessage = async (event) => {
            if (event.data.nativeMesh) {
              const begin = performance.now();
              try {
                const response = await fetch("/mesh-export", {
                  method: "POST",
                  headers: { "Content-Type": "application/octet-stream" },
                  body: event.data.nativeMesh,
                });
                if (!response.ok) throw new Error(await response.text());
                const output = await response.arrayBuffer();
                integrationMs += performance.now() - begin;
                worker.postMessage({ nativeResult: output }, [output]);
              } catch (error) {
                worker.postMessage({ nativeError: error.message });
              }
              return;
            }
            resolve(event.data);
          };
          worker.onerror = (event) => reject(new Error(event.message));
          worker.postMessage({
            document: kind === "preview" ? scenario.preview : scenario.document,
            format: "3mf",
            native: kind === "native-export",
            live: false,
            profile: kind === "native-export",
            signatures: scenario.preview.decorators.map((instance) => [instance.id, "benchmark"]),
          });
        });
        if (data.error) throw new Error(data.error);
        if (data.errors?.length) throw new Error(data.errors.join("; "));
        if (kind !== "preview" && !(data.bytes?.length > 100))
          throw new Error("Missing export bytes");
        if (kind === "preview" && data.meshes?.length !== scenario.count)
          throw new Error("Missing preview meshes");
        results.push({
          kind,
          temperature,
          milliseconds: performance.now() - start,
          ...(kind === "preview"
            ? { triangles: data.meshes.reduce((n, m) => n + m.indices.length / 3, 0) }
            : { bytes: data.bytes.length }),
          ...(kind === "native-export" ? { integrationMs, timings: data.timings } : {}),
        });
      } finally {
        clearTimeout(timer);
        worker.terminate();
        if (kind === "native-export") await fetch("/mesh-export", { method: "DELETE" });
      }
    }
  }
  return results;
}
