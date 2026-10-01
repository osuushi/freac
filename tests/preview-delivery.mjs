export function deliveryGate() {
  return {
    reached: Promise.withResolvers(),
    release: Promise.withResolvers(),
    delivered: Promise.withResolvers(),
    assigned: false,
  };
}

export async function waitForDelivery(gate) {
  let timer;
  try {
    return await Promise.race([
      gate.reached.promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Native preview delivery was not reached")),
          30000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Delay delivery only after the real backend/kernel has computed its response. */
export async function holdReply(route, gate) {
  gate.assigned = true;
  try {
    const response = await route.fetch();
    gate.reached.resolve(await response.json());
    await gate.release.promise;
    await route.fulfill({ response });
  } finally {
    gate.delivered.resolve();
  }
}
