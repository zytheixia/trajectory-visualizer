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
  onNodeClick?: (node: TraceEvent, traceId?: string) => void;
  onNodeHover?: (node: TraceEvent | null, context: unknown) => void;
  onRender?: (node: TraceEvent | null, context: unknown) => void;
  selectedEvents?: TraceEvent[];
  traceSelectedEvents?: Record<string, TraceEvent[]>;
  onRangeClick?: (traceId: string, e1: TraceEvent | null, e2: TraceEvent | null) => void;
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

export class TraceComparisonViewer {
  constructor(canvas: HTMLCanvasElement | string, options?: ViewerOptions);
  setComparison(comparison: TraceComparison, fieldMapping?: FieldMapping): void;
  setOptions(options: ViewerOptions): void;
  resize(): void;
  draw(): void;
  zoomIn(): void;
  zoomOut(): void;
  resetZoom(): void;
  destroy(): void;
}

export type EventRef = {
  traceId: string;
  eventId: string;
  event?: TraceEvent;
};

export type ComparedTrace = {
  traceId: string;
  name: string;
  events: TraceEvent[];
  metadata?: Record<string, unknown>;
};

export type ComparisonAnchor = {
  id: string;
  label: string;
  kind: string;
  eventRefs: EventRef[];
  required?: boolean;
  confidence?: number;
  metadata?: Record<string, unknown>;
};

export type ComparisonSegment = {
  id: string;
  label: string;
  kind: string;
  eventRefs: EventRef[];
  anchorIds?: string[];
  severity?: string;
  summary?: string;
  metadata?: Record<string, unknown>;
};

export type ComparisonFinding = {
  id: string;
  title: string;
  description?: string;
  kind: string;
  eventRefs: EventRef[];
  score?: number;
  severity?: string;
  metadata?: Record<string, unknown>;
};

export type TraceComparison = {
  id: string;
  metrics?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  traces: ComparedTrace[];
  anchors: ComparisonAnchor[];
  segments?: ComparisonSegment[];
  findings?: ComparisonFinding[];
  getEvent?: (traceId: string, eventId: string) => TraceEvent | undefined;
};

export function normalizeComparison(rawComparison: unknown, fieldMapping?: FieldMapping): TraceComparison;

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

export type PositionedTrace = {
  traceId: string;
  name: string;
  events: (TraceEvent & { x: number; y: number; radius: number })[];
  y: number;
};

export type PositionedAnchor = ComparisonAnchor & {
  x: number;
};

export type PositionedSegment = ComparisonSegment & {
  startX: number;
  endX: number;
};

export type ComparisonLayoutResult = {
  positionedTraces: PositionedTrace[];
  positionedAnchors: PositionedAnchor[];
  positionedSegments: PositionedSegment[];
  traceYPositions: number[];
};

export function layoutComparison(options: { comparison: TraceComparison; width: number; height: number }): ComparisonLayoutResult;
