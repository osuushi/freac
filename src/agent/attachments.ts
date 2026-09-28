import { type AgentHost, type AgentReply, agentAttachmentLimit } from "./protocol.js";

export function agentAttachments(
  host: AgentHost,
  action: (run: () => Promise<void>) => Promise<void>,
  report: (value: string, reply: AgentReply) => void,
): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".3mf";
  input.hidden = true;
  input.setAttribute("aria-label", "Attach a 3MF reference");
  input.onchange = () => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    void action(async () => {
      if (file.size > agentAttachmentLimit) throw new Error("Choose a 3MF of at most 20 MiB.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 8192)
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
      const reply = await host.request({ kind: "attach", name: file.name, base64: btoa(binary) });
      if (reply.error) throw new Error(reply.error);
      report(
        `Attached ${reply.attachment}. Ask the agent to use $mesh-recovery with this file.`,
        reply,
      );
    });
  };
  return input;
}
