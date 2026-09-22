/** Transport-local request IDs correlate replies; they are not document identities/revisions. */
export class Rpc {
  private next = 0;
  private pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  private closed = false;
  readonly running = new Set<Promise<void>>();
  constructor(
    private send: (message: string) => void,
    private handle: (method: string, value: unknown) => Promise<unknown>,
    private event: (method: string, value: unknown) => void = () => {},
  ) {}
  request<T>(method: string, value?: unknown): Promise<T> {
    if (this.closed) return Promise.reject(new Error("iPad connection closed"));
    const id = ++this.next;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject });
      try {
        this.send(JSON.stringify({ id, method, value }));
      } catch (error) {
        this.pending.delete(id);
        reject(error);
      }
    });
  }
  emit(method: string, value: unknown): void {
    if (!this.closed) this.send(JSON.stringify({ method, value }));
  }
  receive(text: string): void {
    if (this.closed) return;
    const message = JSON.parse(text);
    if (!message || typeof message !== "object") throw new Error("Invalid connection message");
    if (typeof message.reply === "number") {
      const pending = this.pending.get(message.reply);
      this.pending.delete(message.reply);
      if (message.error) pending?.reject(new Error(String(message.error)));
      else pending?.resolve(message.value);
    } else if (typeof message.method === "string") {
      if (typeof message.id !== "number") this.event(message.method, message.value);
      else {
        const work = this.respond(message.id, message.method, message.value);
        this.running.add(work);
        void work.finally(() => this.running.delete(work));
      }
    } else throw new Error("Invalid connection message");
  }
  private async respond(id: number, method: string, value: unknown): Promise<void> {
    let reply: { reply: number; value?: unknown; error?: string };
    try {
      reply = { reply: id, value: await this.handle(method, value) };
    } catch (error) {
      reply = { reply: id, error: error instanceof Error ? error.message : String(error) };
    }
    if (!this.closed) this.send(JSON.stringify(reply));
  }
  close(): void {
    this.closed = true;
    for (const pending of this.pending.values())
      pending.reject(new Error("iPad connection closed"));
    this.pending.clear();
  }
}
