export type DocumentCommand =
  | "new"
  | "open"
  | "save"
  | "save-as"
  | "close"
  | "quit"
  | "undo"
  | "redo";
export interface DocumentStatus {
  name: string;
  path: string | null;
  edited: boolean;
  warning?: string;
}
export interface DocumentHost {
  command(command: DocumentCommand): Promise<{ replaced: boolean; error?: string }>;
  status(): Promise<DocumentStatus>;
  onCommand(callback: (command: DocumentCommand) => void): () => void;
  onStatus(callback: (status: DocumentStatus) => void): () => void;
}
declare global {
  interface Window {
    freacDocument?: DocumentHost;
  }
}
