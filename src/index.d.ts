export type TraceStatus = "success" | "failed" | "error" | "running" | string;

export type TraceEvent = {
  id: string;
  type: string;
  category: string;
  name: string;
  content?: string;
  time: number;
  durationMs?: number;
  status?: TraceStatus;
  parentId?: string;
  actor?: string;
  metadata?: Record<string, unknown>;
  payload?: unknown;
};

export type ViewerOptions = {
  layoutKey?: string;
  schemeKey?: string;
  colorMode?: string;
  showLabels?: boolean;
  showGrid?: boolean;
  progress?: number;
  worldWidth?: number | null;
  onNodeClick?: (node: TraceEvent, context: unknown) => void;
  onNodeHover?: (node: TraceEvent | null, context: unknown) => void;
  onRender?: (node: TraceEvent | null, context: unknown) => void;
};

export class AgentTraceViewer {
  constructor(canvas: HTMLCanvasElement | string, options?: ViewerOptions);
  setEvents(events: TraceEvent[]): void;
  setOptions(options: ViewerOptions): void;
  resize(): void;
  draw(): void;
  zoomIn(): void;
  zoomOut(): void;
  resetZoom(): void;
  destroy(): void;
}

export type FieldMapping = Record<string, string | string[]>;
export function createMappingAdapter(fieldMapping?: FieldMapping): (rawEvents: unknown[]) => TraceEvent[];
export function identityAdapter(rawEvents: unknown[]): TraceEvent[];

export function discoverFields(events: unknown[]): unknown;
export function isPlainObject(value: unknown): boolean;
export function normalizeEvents(rawEvents: unknown[], fieldMapping?: FieldMapping): TraceEvent[];
export function parseTrace(text: string): unknown[];
export function readPath(value: unknown, path: string | string[]): unknown;

export const adapterContractVersion: string;
export const categoryAliases: Record<string, string[]>;
export const fieldAliases: Record<string, string[]>;
export const laneSchemes: Record<string, unknown>;
export const statusColors: Record<string, string>;
export const visualizationSchemes: Record<string, unknown>;
export function activeLanes(schemeKey: string): unknown[];
export function layoutEvents(options: { events: TraceEvent[]; layoutKey: string; schemeKey: string; width: number; height: number }): TraceEvent[];
export function resolveSchemeLane(event: TraceEvent, schemeKey: string): string;
