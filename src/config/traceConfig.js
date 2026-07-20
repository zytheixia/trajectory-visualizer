export const laneSchemes = {
  event_flow: [
    { key: "input", label: "Input", color: "#2563eb" },
    { key: "reasoning", label: "Reasoning", color: "#7c3aed" },
    { key: "execution", label: "Execution", color: "#059669" },
    { key: "observation", label: "Observation", color: "#475569" },
    { key: "failure", label: "Failure", color: "#dc2626" }
  ],
  tool_timeline: [
    { key: "context", label: "Context", color: "#64748b" },
    { key: "tool", label: "Tool / Command", color: "#059669" },
    { key: "result", label: "Result", color: "#2563eb" },
    { key: "failure", label: "Failure", color: "#dc2626" }
  ],
  llm_trace: [
    { key: "prompt", label: "Prompt", color: "#2563eb" },
    { key: "context", label: "Context", color: "#0f766e" },
    { key: "model", label: "Model", color: "#7c3aed" },
    { key: "check", label: "Check", color: "#f59e0b" },
    { key: "output", label: "Output", color: "#16a34a" },
    { key: "failure", label: "Failure", color: "#dc2626" }
  ]
};

export const categoryAliases = {
  input: "input",
  user: "input",
  human: "input",
  request: "input",
  agent: "reasoning",
  assistant: "reasoning",
  thought: "reasoning",
  reasoning: "reasoning",
  plan: "reasoning",
  llm: "reasoning",
  llm_call: "reasoning",
  tool: "execution",
  execution: "execution",
  function: "execution",
  command: "execution",
  action: "execution",
  system: "observation",
  observation: "observation",
  result: "observation",
  error: "failure",
  exception: "failure",
  failed: "failure",
  failure: "failure"
};

export const fieldAliases = {
  id: ["id", "event_id", "node_id", "step_id", "span_id", "tool_use_id"],
  type: ["type", "role", "kind", "event_type", "node_type", "tool"],
  category: ["category", "lane", "group", "phase"],
  name: ["name", "title", "label", "tool", "action"],
  content: ["content", "message", "text", "input", "output", "summary", "file_path", "introduced_preview"],
  time: ["time", "timestamp", "started_at", "created_at", "ts"],
  duration: ["duration", "duration_ms", "elapsed_ms", "latency_ms"],
  status: ["status", "outcome", "state", "tool_success"],
  metadata: ["metadata", "meta", "attributes", "extra"],
  parent: ["parent", "parent_id", "parentId", "source", "from", "prev"],
  actor: ["actor", "speaker", "participant", "owner", "agent_name", "role"]
};

export const statusColors = {
  running: "#f59e0b",
  success: "#16a34a",
  failed: "#dc2626",
  error: "#dc2626",
  skipped: "#64748b"
};

export const visualizationSchemes = {
  event_flow: {
    label: "事件流",
    description: "展示完整 agent 执行过程，适合通用 run trace。",
    fields: [
      { key: "type", label: "节点类型", required: true },
      { key: "name", label: "节点名称", required: false },
      { key: "category", label: "泳道分类", required: false },
      { key: "content", label: "详情内容", required: false },
      { key: "time", label: "发生时间", required: false },
      { key: "duration", label: "耗时", required: false },
      { key: "status", label: "状态", required: false },
      { key: "id", label: "节点 ID", required: false },
      { key: "parent", label: "父节点/来源", required: false },
      { key: "actor", label: "角色/参与方", required: false },
      { key: "metadata", label: "扩展字段对象", required: false }
    ]
  },
  tool_timeline: {
    label: "工具时间线",
    description: "重点观察工具调用、命令执行、状态和耗时。",
    fields: [
      { key: "name", label: "工具/动作名称", required: true },
      { key: "status", label: "执行状态", required: true },
      { key: "time", label: "开始时间", required: false },
      { key: "duration", label: "耗时", required: false },
      { key: "content", label: "输入/输出摘要", required: false },
      { key: "type", label: "节点类型", required: false },
      { key: "id", label: "调用 ID", required: false },
      { key: "parent", label: "父节点/来源", required: false },
      { key: "actor", label: "执行方", required: false },
      { key: "metadata", label: "扩展字段对象", required: false }
    ]
  },
  llm_trace: {
    label: "LLM 调用链",
    description: "重点观察模型调用、token、成本、耗时和安全检查。",
    fields: [
      { key: "name", label: "调用名称", required: true },
      { key: "type", label: "节点类型", required: true },
      { key: "time", label: "调用时间", required: false },
      { key: "duration", label: "延迟/耗时", required: false },
      { key: "status", label: "状态", required: false },
      { key: "content", label: "提示/结果摘要", required: false },
      { key: "metadata", label: "模型/token/cost 字段", required: false },
      { key: "parent", label: "父节点/来源", required: false },
      { key: "actor", label: "调用方/模型", required: false },
      { key: "id", label: "调用 ID", required: false }
    ]
  }
};
