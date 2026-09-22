export const wifiWarning = "Only use on secure Wi-Fi";
export const wifiDetail =
  "This connection is not encrypted or protected against interception. Anyone who intercepts it may control this document, access files on this computer, and use the agent. Do not use public or shared untrusted Wi-Fi.";

export interface IPadStatus {
  active: boolean;
  connected: boolean;
  urls: string[];
  qr?: string;
}
export interface IPadHost {
  status(): Promise<IPadStatus>;
  start(): Promise<IPadStatus>;
  stop(): Promise<void>;
  onStatus(callback: (status: IPadStatus) => void): () => void;
}
export type DialogRequest =
  | { kind: "message"; message: string; detail?: string; buttons: string[]; cancelId?: number }
  | {
      kind: "open" | "save";
      title?: string;
      defaultPath?: string;
      directory?: boolean;
      extensions?: string[];
    };
export interface DirectoryListing {
  path: string;
  parent: string;
  entries: { name: string; path: string; directory: boolean }[];
}
declare global {
  interface Window {
    freacIPad?: IPadHost;
    freacRemote?: boolean;
  }
}
