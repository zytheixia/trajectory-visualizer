import { normalizeEvents } from "../core/traceModel.js";

export function createMappingAdapter(fieldMapping = {}) {
  return function mappingAdapter(rawEvents) {
    return normalizeEvents(rawEvents, fieldMapping);
  };
}
