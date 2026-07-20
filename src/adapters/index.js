import { identityAdapter } from "./identityAdapter.js";
import { createMappingAdapter } from "./mappingAdapter.js";
import { claudeAdapter } from "./claudeAdapter.js";

export { identityAdapter, createMappingAdapter, claudeAdapter };

export const adapters = {
  auto: {
    id: "auto",
    name: "自动识别",
    transform: (events, options) => {
      if (Array.isArray(events) && events.some((e) => e?.message || e?.sessionId || (e?.type === "user" && e?.promptId))) {
        return claudeAdapter(events);
      }
      if (options?.mapping && Object.keys(options.mapping).length > 0) {
        return createMappingAdapter(options.mapping)(events);
      }
      return identityAdapter(events);
    }
  },
  claude: {
    id: "claude",
    name: "Claude Code 日志",
    transform: (events) => claudeAdapter(events)
  },
  identity: {
    id: "identity",
    name: "标准格式",
    transform: (events) => identityAdapter(events)
  },
  mapping: {
    id: "mapping",
    name: "字段别名映射",
    transform: (events, options) => createMappingAdapter(options?.mapping)(events)
  }
};
