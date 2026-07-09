import { normalizeEvents } from "../core/traceModel.js";

export function identityAdapter(events) {
  return normalizeEvents(events);
}
