import assert from "node:assert/strict";
import test from "node:test";
import type { InspectionView } from "../src/agent/inspection-protocol.js";
import type { DocumentOwner } from "../src/backend/document-owner.js";
import { ScriptSession } from "../src/backend/script-session.js";

test("lost heartbeat cancels pending work and publishes its end only once", async () => {
  let rejectStep!: (error: Error) => void;
  const work = new Promise<never>((_, reject) => {
    rejectStep = reject;
  });
  const published: boolean[] = [];
  let reason = "";
  const owner = {
    beginScript() {},
    view: {},
    scripts: {
      step: () => work,
      cancel: async (error: string) => {
        if (!reason) reason = error;
        rejectStep(new Error("Script cancelled"));
      },
    },
  } as unknown as DocumentOwner;
  const session = new ScriptSession(
    owner,
    async () => ({ selection: [] }) as unknown as InspectionView,
    (running) => published.push(running),
    () => true,
    () => {},
  );
  const { token } = (await session.request({ action: "begin", name: "disconnect" }, "channel")) as {
    token: string;
  };
  const step = session.request(
    {
      action: "step",
      token,
      operation: {
        kind: "createSketch",
        input: { plane: "XY", curves: [] },
      },
    },
    "channel",
  );
  await assert.rejects(session.request({ action: "cancel", token }, "other"), /connection/);
  await assert.rejects(step, /cancelled/);
  assert.equal(reason, "Script runner disconnected");
  assert.equal(session.busy, false);
  assert.deepEqual(published, [true, false]);
});
