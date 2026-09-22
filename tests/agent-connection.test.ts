import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { AgentConnection, type ConnectionRequest } from "../src/host/agent-connection.js";

async function send(
  connection: AgentConnection,
  request: ConnectionRequest,
  capability = connection.capability,
) {
  const base = join(connection.directory, randomUUID());
  await writeFile(`${base}.request`, JSON.stringify({ capability, ...request }));
  return {
    path: `${base}.request`,
    async reply() {
      for (let i = 0; i < 150; i++) {
        try {
          return JSON.parse(await readFile(`${base}.response`, "utf8"));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        await delay(20);
      }
      throw new Error("No response");
    },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("inspections wait without blocking status or authenticated cancellation; failures release lock", async () => {
  const started = deferred<void>();
  const release = deferred<void>();
  const calls: string[] = [];
  const connection = await AgentConnection.create(async ({ command, script }) => {
    calls.push(script?.action ?? command);
    if (command === "selection") {
      started.resolve();
      await release.promise;
      throw new Error("measurement failed");
    }
    if (script?.action === "cancel") release.resolve();
    return { command };
  });
  try {
    const first = await send(connection, { command: "selection" });
    await started.promise;
    const second = await send(connection, { command: "inspect" });
    await delay(100);
    assert.deepEqual(calls, ["selection"]);
    assert.match(
      (await (await send(connection, { command: "status" }, "wrong")).reply()).error,
      /Invalid Freac connection/,
    );
    assert.deepEqual(await (await send(connection, { command: "status" })).reply(), {
      result: { command: "status" },
    });
    await (await send(connection, { command: "script", script: { action: "poll" } })).reply();
    await (await send(connection, { command: "script", script: { action: "cancel" } })).reply();
    assert.match((await first.reply()).error, /measurement failed/);
    assert.deepEqual(await second.reply(), { result: { command: "inspect" } });
    assert.deepEqual(calls, ["selection", "status", "poll", "cancel", "inspect"]);
  } finally {
    release.resolve();
    await connection.close();
  }
});

for (const reason of ["closed", "abandoned"]) {
  test(`queued commands do not execute after connection is ${reason}`, async () => {
    const started = deferred<void>();
    const release = deferred<void>();
    const calls: string[] = [];
    const connection = await AgentConnection.create(async ({ command }) => {
      calls.push(command);
      if (command === "selection") {
        started.resolve();
        await release.promise;
      }
      return { command };
    });
    try {
      await send(connection, { command: "selection" });
      await started.promise;
      const queued = await send(connection, { command: "inspect" });
      await delay(100);
      if (reason === "closed") {
        const closing = connection.close();
        release.resolve();
        await closing;
      } else {
        await rm(queued.path);
        release.resolve();
        assert.match((await queued.reply()).error, /ENOENT/);
      }
      assert.deepEqual(calls, ["selection"]);
    } finally {
      release.resolve();
      await connection.close();
    }
  });
}
