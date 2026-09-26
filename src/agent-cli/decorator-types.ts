/** Public decorator declarations used by the CLI compiler and freac types. */
export const decoratorTypes = `
export type DecoratorSettings = Record<string, string | number | boolean>;
export interface DecoratorFace { body: string; face: string }
export interface DecoratorEdge { body: string; edge: string }
export interface DecoratorField {
  key: string; label: string; type: "number" | "enum"; unit?: string;
  min?: number; max?: number; default?: string | number | boolean;
  visibleWhen?: { key: string; values: readonly (string | number | boolean)[] };
  options?: readonly { value: string; label: string }[];
}
export interface DecoratorDefinition {
  id: string; version: number; name: string; source: string;
  fields: readonly DecoratorField[]; preview?: boolean; livePreview?: boolean;
}
export interface DecoratorPreviewSample<State = unknown> {
  durationMs: number; state: State | null;
}
export interface DecoratorPreviewFeedback<State = unknown> {
  targetMs: number; history: readonly DecoratorPreviewSample<State>[];
}
export interface DecoratorPreviewContext<State = unknown> {
  quality: "preview"; tolerance: number; live: boolean;
  preview: DecoratorPreviewFeedback<State>;
}
export interface DecoratorPreviewMesh {
  vertices: [number, number, number][]; triangles: [number, number, number][];
}
export type DecoratorPreviewOutput<State = unknown> =
  | DecoratorPreviewMesh | null
  | { mesh: DecoratorPreviewMesh | null; state?: State | null };
export interface DecoratorInstance {
  readonly id: string; readonly definition: string; readonly version: number;
  readonly faces: readonly DecoratorFace[]; readonly settings: DecoratorSettings;
  readonly frame: Plane; readonly axialReference?: [number, number];
  readonly problem?: string; readonly state?: unknown;
}
export interface DecoratorCatalog {
  instances: readonly DecoratorInstance[];
  definitions: readonly (DecoratorDefinition & { enabled: boolean })[];
  builtins: { id: string; version: number; name: string; fields: readonly DecoratorField[] }[];
}
export type DecoratorEdit =
  | { action: "apply"; definition: string; version?: number; faces: DecoratorFace[]; settings?: DecoratorSettings }
  | { action: "settings"; ids: string[]; patch: DecoratorSettings }
  | { action: "continue" | "reassign"; id: string; faces: DecoratorFace[] }
  | { action: "discard"; id: string }
  | { action: "remove"; faces: DecoratorFace[] };
export type DecoratorDefinitionEdit =
  | { action: "install"; definition: DecoratorDefinition }
  | { action: "remove"; id: string; version: number };
export interface DecoratorInspectionRequest {
  definition: string; version: number; faces: DecoratorFace[];
  instanceId?: string; settings?: DecoratorSettings;
}
export interface DecoratorInspection {
  reason: string | null;
  groups: { faces: DecoratorFace[]; state?: unknown }[];
  diagnostics: { severity: "warning" | "error"; message: string; faces?: DecoratorFace[]; edges?: DecoratorEdge[] }[];
}
export interface DecoratorScriptApi {
  decorators(): Promise<DecoratorCatalog>;
  editDecorator(input: DecoratorEdit): Promise<DecoratorCatalog>;
  editDecoratorDefinition(input: DecoratorDefinitionEdit): Promise<DecoratorCatalog>;
  enableDecorator(input: { id: string; version: number; enabled: boolean }): Promise<DecoratorCatalog>;
  inspectDecorator(input: DecoratorInspectionRequest): Promise<DecoratorInspection>;
}
`;
