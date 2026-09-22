import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type Server } from "node:http";
import { networkInterfaces } from "node:os";
import QRCode from "qrcode";
import { WebSocket, WebSocketServer } from "ws";
import type { IPadStatus } from "../ipad/protocol.js";
import { Rpc } from "../ipad/rpc.js";
import { serveIPad } from "./ipad-http.js";

/** One explicitly enabled LAN listener and one authenticated editor. */
export class IPadServer {
  private server: Server | null = null;
  private sockets: WebSocketServer | null = null;
  private socket: WebSocket | null = null;
  private peer: Rpc | null = null;
  private token = "";
  private timer: ReturnType<typeof setInterval> | undefined;
  private cleanup: Promise<void> = Promise.resolve();
  private stopping = false;
  private state: IPadStatus = { active: false, connected: false, urls: [] };
  constructor(
    private root: string,
    private handle: (method: string, value: unknown) => Promise<unknown>,
    private disconnected: () => Promise<void>,
    private changed: (status: IPadStatus) => void,
  ) {}
  get status(): IPadStatus {
    return this.state;
  }
  get active(): boolean {
    return this.state.active;
  }
  async start(): Promise<IPadStatus> {
    if (this.server) return this.state;
    this.stopping = false;
    this.token = randomBytes(32).toString("hex");
    const server = createServer(
      (request, response) => void serveIPad(this.root, request, response),
    );
    this.server = server;
    const sockets = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024 * 1024 });
    this.sockets = sockets;
    server.on("upgrade", (request, socket, head) => {
      if (
        request.url !== "/connect" ||
        request.headers.origin !== `http://${request.headers.host}` ||
        this.stopping
      ) {
        socket.destroy();
        return;
      }
      sockets.handleUpgrade(request, socket, head, (ws) => this.connect(ws));
    });
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "0.0.0.0", () => {
          server.removeListener("error", reject);
          resolve();
        });
      });
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("No iPad server address");
      const addresses = Object.values(networkInterfaces())
        .flat()
        .filter((entry) => entry?.family === "IPv4" && !entry.internal);
      const urls = [
        ...new Set(
          addresses.map((entry) => `http://${entry?.address}:${address.port}/#${this.token}`),
        ),
      ];
      // Loopback is also useful when testing without a network interface.
      if (!urls.length) urls.push(`http://127.0.0.1:${address.port}/#${this.token}`);
      this.state = {
        active: true,
        connected: false,
        urls,
        qr: await QRCode.toDataURL(urls[0], { width: 280, margin: 2 }),
      };
      this.changed(this.state);
      return this.state;
    } catch (error) {
      await this.stop();
      throw error;
    }
  }
  private connect(socket: WebSocket): void {
    let authenticated = false;
    let alive = true;
    let authenticating = false;
    const timeout = setTimeout(() => {
      if (!authenticated) socket.terminate();
    }, 5000);
    socket.on("error", () => socket.terminate());
    socket.on("pong", () => {
      alive = true;
    });
    socket.on("message", (data) => {
      if (authenticated) {
        if (this.socket !== socket) return;
        try {
          this.peer?.receive(data.toString());
        } catch {
          socket.close(1008, "Invalid message");
        }
      } else if (!authenticating) {
        authenticating = true;
        void this.authenticate(socket, data.toString())
          .then((accepted) => {
            authenticated = accepted;
            clearTimeout(timeout);
            if (!accepted) {
              socket.close(1008, "Invalid pairing or another iPad is connected");
              return;
            }
            this.timer = setInterval(() => {
              if (!alive) {
                socket.terminate();
                return;
              }
              alive = false;
              socket.ping();
              this.peer?.emit("heartbeat", null);
            }, 3000);
          })
          .catch(() => socket.terminate());
      }
    });
    socket.once("close", () => {
      clearTimeout(timeout);
      if (socket !== this.socket) return;
      this.detach();
    });
  }
  private async authenticate(socket: WebSocket, message: string): Promise<boolean> {
    const { token } = JSON.parse(message);
    if (
      typeof token !== "string" ||
      token.length !== this.token.length ||
      !this.token ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(this.token))
    )
      return false;
    await this.cleanup;
    if (this.socket || this.stopping || !this.active || socket.readyState !== WebSocket.OPEN)
      return false;
    this.socket = socket;
    this.peer = new Rpc((message) => socket.send(message), this.handle);
    this.state = { ...this.state, connected: true };
    socket.send(JSON.stringify({ method: "ready" }));
    this.changed(this.state);
    return true;
  }
  private detach(): void {
    clearInterval(this.timer);
    const peer = this.peer;
    this.peer = null;
    this.socket = null;
    peer?.close();
    this.state = { ...this.state, connected: false };
    this.changed(this.state);
    this.cleanup = (async () => {
      // Closing pending browser prompts unblocks file commands before the next editor.
      await this.disconnected();
      await Promise.allSettled(peer ? [...peer.running] : []);
      // A non-cancellable operation may have been finishing at disconnect.
      await this.disconnected();
    })();
    void this.cleanup.catch(console.error);
  }
  emit(method: string, value: unknown): void {
    this.peer?.emit(method, value);
  }
  request<T>(method: string, value?: unknown): Promise<T> {
    if (!this.peer)
      return Promise.reject(new Error("Reconnect the iPad or return control to the computer."));
    return this.peer.request<T>(method, value);
  }
  async stop(): Promise<void> {
    this.stopping = true;
    this.token = "";
    const socket = this.socket;
    if (socket) {
      this.detach();
      socket.close(1000, "Control returned to computer");
      socket.terminate();
    }
    for (const client of this.sockets?.clients ?? []) client.terminate();
    this.sockets?.close();
    this.sockets = null;
    const server = this.server;
    this.server = null;
    server?.closeAllConnections();
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    await this.cleanup;
    this.state = { active: false, connected: false, urls: [] };
    this.changed(this.state);
  }
}
