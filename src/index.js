export { AgentTraceViewer } from "./viewer/AgentTraceViewer.js";

export { createMappingAdapter, identityAdapter } from "./adapters/index.js";

export {
  discoverFields,
  isPlainObject,
  normalizeEvents,
  parseTrace,
  readPath
} from "./core/traceModel.js";

export { adapterContractVersion } from "./core/adapterTypes.js";

export {
  categoryAliases,
  fieldAliases,
  laneSchemes,
  statusColors,
  visualizationSchemes
} from "./config/traceConfig.js";

export { activeLanes, layoutEvents, resolveSchemeLane } from "./layouts/layoutEngine.js";
