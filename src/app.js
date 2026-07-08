const canvas = document.querySelector("#trackCanvas");
const ctx = canvas.getContext("2d");
const fileInput = document.querySelector("#fileInput");
const sampleSelect = document.querySelector("#sampleSelect");
const loadSampleBtn = document.querySelector("#loadSampleBtn");
const clearBtn = document.querySelector("#clearBtn");
const schemeSelect = document.querySelector("#schemeSelect");
const colorMode = document.querySelector("#colorMode");
const showLabels = document.querySelector("#showLabels");
const showGrid = document.querySelector("#showGrid");
const mappingPanel = document.querySelector("#mappingPanel");
const mappingSummary = document.querySelector("#mappingSummary");
const mappingRows = document.querySelector("#mappingRows");
const applyMappingBtn = document.querySelector("#applyMappingBtn");
const statsGrid = document.querySelector("#statsGrid");
const detailPanel = document.querySelector("#detailPanel");
const trackName = document.querySelector("#trackName");
const trackMeta = document.querySelector("#trackMeta");
const emptyState = document.querySelector("#emptyState");
const tooltip = document.querySelector("#tooltip");
const playBtn = document.querySelector("#playBtn");
const timeSlider = document.querySelector("#timeSlider");
const timeOutput = document.querySelector("#timeOutput");

const laneSchemes = {
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

const categoryAliases = {
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

const fieldAliases = {
  id: ["id", "event_id", "node_id", "step_id", "span_id"],
  type: ["type", "role", "kind", "event_type", "node_type"],
  category: ["category", "lane", "group", "phase"],
  name: ["name", "title", "label", "tool", "action"],
  content: ["content", "message", "text", "input", "output", "summary"],
  time: ["time", "timestamp", "started_at", "created_at", "ts"],
  duration: ["duration", "duration_ms", "elapsed_ms", "latency_ms"],
  status: ["status", "outcome", "state"],
  metadata: ["metadata", "meta", "attributes", "extra"]
};

const statusColors = {
  running: "#f59e0b",
  success: "#16a34a",
  failed: "#dc2626",
  error: "#dc2626",
  skipped: "#64748b"
};

let events = [];
let positioned = [];
let hoverIndex = -1;
let selectedIndex = 0;
let playTimer = null;
let pendingRawEvents = [];
let pendingTraceName = "";
let discoveredFields = [];

const visualizationSchemes = {
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
      { key: "id", label: "调用 ID", required: false }
    ]
  }
};

function currentSchemeKey() {
  return schemeSelect.value || "event_flow";
}

function activeLanes() {
  return laneSchemes[currentSchemeKey()] || laneSchemes.event_flow;
}

function resolveSchemeLane(event) {
  const scheme = currentSchemeKey();
  if (event.status === "failed" || event.status === "error" || event.category === "failure") return "failure";

  if (scheme === "tool_timeline") {
    if (event.category === "execution") return "tool";
    if (event.category === "observation") return "result";
    return "context";
  }

  if (scheme === "llm_trace") {
    if (["input", "user", "human", "user_message", "task"].includes(event.type) || event.category === "input") {
      return "prompt";
    }
    if (/retrieval|search|context|memory/i.test(event.type)) return "context";
    if (/llm|model|completion|chat/i.test(event.type) || event.category === "reasoning") return "model";
    if (/guardrail|check|moderation|validation/i.test(event.type)) return "check";
    return "output";
  }

  return event.category;
}

const sampleTraces = {
  debug: {
    name: "调试修复示例",
    events: [
      {
        id: "evt-1",
        type: "user",
        name: "用户请求",
        content: "分析 anno-runner 的失败测试，并给出修复方案。",
        time: "2026-07-08T09:00:00Z",
        status: "success"
      },
      {
        id: "evt-2",
        type: "planning",
        category: "reasoning",
        name: "规划",
        content: "读取测试输出，定位失败路径，优先复现最小问题。",
        time: "2026-07-08T09:00:08Z",
        duration: 12,
        status: "success",
        metadata: {
          model: "gpt-5-codex",
          tokens: 428
        }
      },
      {
        id: "evt-3",
        type: "shell_command",
        category: "execution",
        name: "rg",
        content: "搜索 failing assertion 和相关 fixture。",
        time: "2026-07-08T09:00:24Z",
        duration: 3,
        status: "success",
        metadata: {
          command: "rg failing assertion",
          cwd: "/home/zyt/projects/anno-runner"
        }
      },
      {
        id: "evt-4",
        type: "observation",
        name: "观察",
        content: "发现 parser 对缺失 optional 字段处理不一致。",
        time: "2026-07-08T09:00:32Z",
        status: "success"
      },
      {
        id: "evt-5",
        type: "test_run",
        category: "execution",
        name: "pytest",
        content: "运行 tests/test_harbor_parser.py::test_missing_optional_fields。",
        time: "2026-07-08T09:00:46Z",
        duration: 8,
        status: "failed",
        metadata: {
          command: "pytest tests/test_harbor_parser.py::test_missing_optional_fields",
          exit_code: 1
        }
      },
      {
        id: "evt-6",
        type: "error",
        name: "断言失败",
        content: "expected empty list, got None。",
        time: "2026-07-08T09:00:55Z",
        status: "failed"
      },
      {
        id: "evt-7",
        type: "patch",
        category: "execution",
        name: "修改代码",
        content: "统一 normalize 阶段的默认值，并补充回归测试。",
        time: "2026-07-08T09:01:11Z",
        duration: 45,
        status: "success",
        files_changed: ["packages/harbor_ingest/parser.py", "tests/test_harbor_parser.py"]
      },
      {
        id: "evt-8",
        type: "test_run",
        category: "execution",
        name: "pytest",
        content: "运行相关测试文件。",
        time: "2026-07-08T09:02:02Z",
        duration: 14,
        status: "success",
        metadata: {
          command: "pytest tests/test_harbor_parser.py",
          exit_code: 0
        }
      },
      {
        id: "evt-9",
        type: "final_answer",
        category: "reasoning",
        name: "总结",
        content: "报告修改点、验证结果和剩余风险。",
        time: "2026-07-08T09:02:24Z",
        status: "success"
      }
    ]
  },
  minimal: {
    name: "最小字段示例",
    events: [
      { type: "user", content: "帮我检查这个 bug" },
      { type: "thought", content: "需要先复现问题" },
      { type: "tool", name: "npm test", status: "failed" },
      { type: "error", content: "TypeError: Cannot read properties of undefined" },
      { type: "assistant", content: "定位到空值分支，建议补默认值" }
    ]
  },
  aliases: {
    name: "字段别名示例",
    events: [
      {
        event_id: "alias-1",
        kind: "human",
        title: "外部系统字段",
        message: "这个事件没有使用我们的标准字段名。",
        started_at: "2026-07-08T09:30:00Z",
        outcome: "success",
        trace_id: "trace-ext-001"
      },
      {
        node_id: "alias-2",
        event_type: "llm_call",
        phase: "reasoning",
        label: "模型节点",
        text: "字段通过 aliases 映射到内部模型。",
        ts: "2026-07-08T09:30:05Z",
        latency_ms: 1320,
        state: "success",
        attributes: {
          model: "claude-4-sonnet",
          input_tokens: 980,
          output_tokens: 143
        }
      },
      {
        step_id: "alias-3",
        node_type: "function",
        group: "execution",
        action: "lookupCustomer",
        output: "查询客户等级和历史工单。",
        created_at: "2026-07-08T09:30:09Z",
        elapsed_ms: 410,
        extra: {
          endpoint: "/internal/customers/cus_1024",
          http_status: 200
        }
      }
    ]
  },
  llm: {
    name: "LLM 调用示例",
    events: [
      {
        id: "llm-1",
        type: "user_message",
        category: "input",
        name: "需求",
        content: "生成一个账单解释摘要。",
        time: "2026-07-08T10:00:00Z"
      },
      {
        id: "llm-2",
        type: "retrieval",
        category: "execution",
        name: "检索账单上下文",
        content: "读取用户过去 3 个月账单。",
        time: "2026-07-08T10:00:04Z",
        duration_ms: 620,
        datasource: "billing-ledger",
        rows: 42
      },
      {
        id: "llm-3",
        type: "llm_call",
        category: "reasoning",
        name: "生成摘要",
        content: "调用模型生成解释。",
        time: "2026-07-08T10:00:06Z",
        duration_ms: 1840,
        status: "success",
        metadata: {
          provider: "openai",
          model: "gpt-5",
          prompt_tokens: 1380,
          completion_tokens: 212,
          cost_usd: 0.0184,
          temperature: 0.2
        }
      },
      {
        id: "llm-4",
        type: "guardrail_check",
        category: "observation",
        name: "安全检查",
        content: "检查是否包含敏感财务建议。",
        time: "2026-07-08T10:00:09Z",
        duration_ms: 240,
        policy: "finance-advice-v2",
        flagged: false
      }
    ]
  },
  browser: {
    name: "浏览器 Agent 示例",
    events: [
      {
        id: "web-1",
        type: "task",
        category: "input",
        name: "用户任务",
        content: "打开后台，导出今天的订单 CSV。",
        time: "2026-07-08T11:20:00Z"
      },
      {
        id: "web-2",
        type: "browser_navigate",
        category: "execution",
        name: "打开登录页",
        content: "访问运营后台。",
        time: "2026-07-08T11:20:05Z",
        url: "https://admin.example.com/orders",
        tab_id: "tab-7"
      },
      {
        id: "web-3",
        type: "browser_click",
        category: "execution",
        name: "点击导出",
        content: "点击订单表格右上角导出按钮。",
        time: "2026-07-08T11:20:18Z",
        selector: "[data-testid='export-orders']",
        screenshot: "artifacts/order-export-click.png"
      },
      {
        id: "web-4",
        type: "download",
        category: "observation",
        name: "下载完成",
        content: "生成 orders-2026-07-08.csv。",
        time: "2026-07-08T11:20:31Z",
        file_name: "orders-2026-07-08.csv",
        bytes: 83412,
        checksum: "sha256:9d2f..."
      }
    ]
  },
  business: {
    name: "业务审批示例",
    events: [
      {
        id: "biz-1",
        type: "ticket_created",
        category: "input",
        name: "审批单",
        content: "客户申请提高 API 限额。",
        time: "2026-07-08T13:00:00Z",
        customer_id: "cus_1024",
        priority: "high"
      },
      {
        id: "biz-2",
        type: "risk_score",
        category: "execution",
        name: "风险评分",
        content: "调用内部风控服务。",
        time: "2026-07-08T13:00:03Z",
        score: 0.18,
        rules_hit: ["account_age_ok", "payment_ok"]
      },
      {
        id: "biz-3",
        type: "human_approval",
        category: "observation",
        name: "人工审批",
        content: "运营同意临时提高限额 7 天。",
        time: "2026-07-08T13:05:42Z",
        approver: "ops@example.com",
        sla_minutes: 15
      },
      {
        id: "biz-4",
        type: "quota_update",
        category: "execution",
        name: "更新限额",
        content: "把每日请求限制从 10k 提升到 50k。",
        time: "2026-07-08T13:06:12Z",
        old_limit: 10000,
        new_limit: 50000,
        expires_at: "2026-07-15T13:06:12Z"
      }
    ]
  }
};

function parseTrace(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.events)) return parsed.events;
    if (Array.isArray(parsed.trace)) return parsed.trace;
    if (Array.isArray(parsed.steps)) return parsed.steps;
    if (Array.isArray(parsed.nodes)) return parsed.nodes;
  } catch {
    if (!trimmed.includes("\n")) throw new Error("无法解析 JSON 运行轨迹。");
    return trimmed
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }

  throw new Error("JSON 需要是事件数组，或包含 events / trace / steps / nodes 数组。");
}

function normalizeEvents(rawEvents, fieldMapping = null) {
  return rawEvents
    .map((event, index) => {
      const rawType = readField(event, "type", fieldMapping) || readField(event, "category", fieldMapping) || "agent";
      const type = normalizeType(rawType);
      const category = normalizeCategory(readField(event, "category", fieldMapping) || rawType);
      const time = parseTime(readField(event, "time", fieldMapping), index);
      const durationValue = readField(event, "duration", fieldMapping) ?? 0;
      const duration = Number(durationValue);
      const durationMs = Number.isFinite(duration)
        ? isMillisecondDurationField(event, fieldMapping)
          ? duration
          : duration * 1000
        : 0;
      const status = String(readField(event, "status", fieldMapping) || "success").toLowerCase();
      return {
        id: readField(event, "id", fieldMapping) || `event-${index + 1}`,
        type,
        category,
        lane: category,
        name: readField(event, "name", fieldMapping) || typeLabel(type),
        content: readField(event, "content", fieldMapping) || "",
        time,
        rawTime: readField(event, "time", fieldMapping) || "",
        durationMs,
        status,
        metadata: collectMetadata(event, fieldMapping),
        payload: event
      };
    })
    .sort((a, b) => a.time - b.time)
    .map((event, index, list) => ({
      ...event,
      index,
      gapMs: index === 0 ? 0 : Math.max(event.time - list[index - 1].time, 0)
    }));
}

function normalizeType(value) {
  return String(value || "agent")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function readField(event, canonicalName, fieldMapping = null) {
  if (fieldMapping?.[canonicalName]) {
    return readPath(event, fieldMapping[canonicalName]);
  }
  const aliases = fieldAliases[canonicalName] || [canonicalName];
  const key = aliases.find((alias) => readPath(event, alias) !== undefined && readPath(event, alias) !== null && readPath(event, alias) !== "");
  return key ? readPath(event, key) : undefined;
}

function isMillisecondDurationField(event, fieldMapping = null) {
  const mappedField = fieldMapping?.duration || "";
  if (/_ms$|latency/i.test(mappedField)) return true;
  return ["duration_ms", "elapsed_ms", "latency_ms"].some((key) => event[key] !== undefined);
}

function normalizeCategory(value) {
  const key = normalizeType(value);
  return categoryAliases[key] || "reasoning";
}

function collectMetadata(event, fieldMapping = null) {
  const reserved = new Set(fieldMapping ? Object.values(fieldMapping).filter(Boolean) : Object.values(fieldAliases).flat());
  const mappedMetadata = readField(event, "metadata", fieldMapping);
  const metadata = { ...(isPlainObject(mappedMetadata) ? mappedMetadata : {}) };
  Object.entries(event).forEach(([key, value]) => {
    if (!reserved.has(key)) metadata[key] = value;
  });
  return metadata;
}

function readPath(source, path) {
  if (!path) return undefined;
  return String(path)
    .split(".")
    .reduce((value, segment) => (value == null ? undefined : value[segment]), source);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseTime(value, fallback) {
  if (!value) return fallback;
  const date = Date.parse(value);
  if (Number.isFinite(date)) return date;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function loadTrace(rawEvents, name, fieldMapping = null) {
  events = normalizeEvents(rawEvents, fieldMapping);
  if (events.length < 1) throw new Error("至少需要一个有效事件。");
  selectedIndex = 0;
  hoverIndex = -1;
  timeSlider.value = "100";
  trackName.textContent = name;
  emptyState.hidden = true;
  updateStats();
  updateDetails(events[0]);
  resizeCanvas();
}

function prepareTraceMapping(rawEvents, name, shouldAutoApply = false) {
  pendingRawEvents = rawEvents;
  pendingTraceName = name;
  discoveredFields = discoverFields(rawEvents);
  renderMappingPanel();

  if (shouldAutoApply) {
    applyCurrentMapping();
    return;
  }

  trackName.textContent = name;
  trackMeta.textContent = "请选择字段映射后渲染";
  emptyState.hidden = false;
}

function discoverFields(rawEvents) {
  const fields = new Set();
  rawEvents.slice(0, 50).forEach((event) => {
    collectPaths(event, "", fields, 2);
  });
  return Array.from(fields).sort((a, b) => a.localeCompare(b));
}

function collectPaths(value, prefix, fields, depth) {
  if (!isPlainObject(value) || depth < 0) return;
  Object.entries(value).forEach(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    fields.add(path);
    if (isPlainObject(child)) collectPaths(child, path, fields, depth - 1);
  });
}

function renderMappingPanel() {
  const scheme = visualizationSchemes[schemeSelect.value] || visualizationSchemes.event_flow;
  mappingPanel.hidden = false;
  mappingSummary.textContent = `${scheme.description} 已识别 ${discoveredFields.length} 个字段，带 * 的字段必须映射。`;
  mappingRows.innerHTML = scheme.fields.map((field) => renderMappingRow(field)).join("");
}

function renderMappingRow(field) {
  const guessedField = guessSourceField(field.key);
  const options = [
    `<option value="">不映射</option>`,
    ...discoveredFields.map((sourceField) => {
      const selected = sourceField === guessedField ? " selected" : "";
      return `<option value="${escapeHtml(sourceField)}"${selected}>${escapeHtml(sourceField)}</option>`;
    })
  ].join("");

  return `
    <label class="mapping-row">
      <span>${escapeHtml(field.label)}${field.required ? " *" : ""}</span>
      <select data-field="${escapeHtml(field.key)}" data-required="${field.required ? "true" : "false"}">
        ${options}
      </select>
    </label>
  `;
}

function guessSourceField(canonicalName) {
  const aliases = fieldAliases[canonicalName] || [canonicalName];
  return aliases.find((alias) => discoveredFields.includes(alias)) || "";
}

function readCurrentMapping() {
  const mapping = {};
  mappingRows.querySelectorAll("select[data-field]").forEach((select) => {
    if (select.value) mapping[select.dataset.field] = select.value;
  });
  return mapping;
}

function validateMapping() {
  const missing = [];
  mappingRows.querySelectorAll("select[data-field]").forEach((select) => {
    if (select.dataset.required === "true" && !select.value) {
      missing.push(select.closest(".mapping-row").querySelector("span").textContent.replace(" *", ""));
    }
  });
  return missing;
}

function applyCurrentMapping(options = {}) {
  const missing = validateMapping();
  if (missing.length) {
    if (!options.silent) alert(`请先映射必要字段：${missing.join("、")}`);
    return;
  }
  loadTrace(pendingRawEvents, pendingTraceName, readCurrentMapping());
}

function resizeCanvas() {
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

function layoutEvents() {
  const lanes = activeLanes();
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const left = 130;
  const right = 48;
  const top = 54;
  const bottom = 42;
  const usableWidth = Math.max(320, width - left - right);
  const usableHeight = Math.max(280, height - top - bottom);
  const laneGap = usableHeight / Math.max(lanes.length - 1, 1);
  const firstTime = events[0]?.time ?? 0;
  const lastTime = events.at(-1)?.time ?? firstTime + events.length;
  const duration = Math.max(lastTime - firstTime, events.length - 1, 1);

  return events.map((event, index) => {
    const laneKey = resolveSchemeLane(event);
    const laneIndex = lanes.findIndex((lane) => lane.key === laneKey);
    const fallbackX = left + (usableWidth * index) / Math.max(events.length - 1, 1);
    const timeX = left + ((event.time - firstTime) / duration) * usableWidth;
    return {
      ...event,
      displayLane: laneKey,
      x: Number.isFinite(timeX) ? timeX : fallbackX,
      y: top + Math.max(laneIndex, 0) * laneGap,
      radius: event.category === "failure" || event.status === "failed" ? 13 : 10
    };
  });
}

function draw() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  ctx.clearRect(0, 0, width, height);
  drawBackground(width, height);

  positioned = layoutEvents();
  const visibleCount = Math.max(0, Math.ceil((positioned.length * Number(timeSlider.value)) / 100));
  const visible = positioned.slice(0, visibleCount);
  if (!visible.length) return;

  drawConnections(visible);
  visible.forEach((event, index) => drawEvent(event, index === hoverIndex || index === selectedIndex));
  updateTimelineLabel(visible.at(-1));
}

function drawBackground(width, height) {
  const lanes = activeLanes();
  ctx.fillStyle = "#f6f8fb";
  ctx.fillRect(0, 0, width, height);

  lanes.forEach((lane, index) => {
    const y = 54 + index * (Math.max(280, height - 96) / Math.max(lanes.length - 1, 1));
    ctx.strokeStyle = index % 2 === 0 ? "rgba(148, 163, 184, 0.32)" : "rgba(148, 163, 184, 0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(108, y);
    ctx.lineTo(width - 28, y);
    ctx.stroke();
    ctx.fillStyle = lane.color;
    ctx.font = "700 12px Inter, system-ui, sans-serif";
    ctx.fillText(lane.label, 24, y + 4);
  });

  if (!showGrid.checked) return;
  ctx.strokeStyle = "rgba(148, 163, 184, 0.16)";
  for (let x = 130; x < width - 28; x += 72) {
    ctx.beginPath();
    ctx.moveTo(x, 28);
    ctx.lineTo(x, height - 28);
    ctx.stroke();
  }
}

function drawConnections(visible) {
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  for (let index = 1; index < visible.length; index += 1) {
    const previous = visible[index - 1];
    const current = visible[index];
    ctx.strokeStyle = getConnectionColor(current, index / Math.max(visible.length - 1, 1));
    ctx.beginPath();
    ctx.moveTo(previous.x, previous.y);
    const midX = previous.x + (current.x - previous.x) * 0.5;
    ctx.bezierCurveTo(midX, previous.y, midX, current.y, current.x, current.y);
    ctx.stroke();
  }
}

function drawEvent(event, isActive) {
  const lanes = activeLanes();
  const lane = lanes.find((item) => item.key === event.displayLane) || lanes[1];
  const statusColor = statusColors[event.status] || lane.color;
  ctx.fillStyle = "white";
  ctx.strokeStyle = isActive ? "#111827" : statusColor;
  ctx.lineWidth = isActive ? 4 : 3;
  ctx.beginPath();
  ctx.arc(event.x, event.y, event.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = statusColor;
  ctx.beginPath();
  ctx.arc(event.x, event.y, Math.max(4, event.radius - 6), 0, Math.PI * 2);
  ctx.fill();

  if (!showLabels.checked) return;
  const label = event.name.length > 24 ? `${event.name.slice(0, 22)}...` : event.name;
  ctx.fillStyle = "#172033";
  ctx.font = "700 12px Inter, system-ui, sans-serif";
  ctx.fillText(label, event.x + 14, event.y - 10);
  ctx.fillStyle = "#657086";
  ctx.font = "11px Inter, system-ui, sans-serif";
  ctx.fillText(formatDuration(event.durationMs), event.x + 14, event.y + 7);
}

function getConnectionColor(event, progress) {
  const lanes = activeLanes();
  if (colorMode.value === "type") {
    return lanes.find((lane) => lane.key === event.displayLane)?.color || "#1267d8";
  }
  if (colorMode.value === "status") {
    return statusColors[event.status] || "#1267d8";
  }
  return interpolateColor("#2563eb", "#16a34a", progress);
}

function interpolateColor(start, end, ratio) {
  const a = hexToRgb(start);
  const b = hexToRgb(end);
  const mixed = a.map((value, index) => Math.round(value + (b[index] - value) * ratio));
  return `rgb(${mixed.join(",")})`;
}

function hexToRgb(hex) {
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
}

function updateStats() {
  updateStatsLabels();
  const scheme = currentSchemeKey();
  const executionCount = events.filter((event) => event.category === "execution").length;
  const failures = events.filter((event) => event.category === "failure" || event.status === "failed").length;
  const modelCalls = events.filter((event) => /llm|model|completion|chat/i.test(event.type)).length;
  const checks = events.filter((event) => /guardrail|check|moderation|validation/i.test(event.type)).length;
  const totalDuration = events.reduce((sum, event) => sum + event.durationMs, 0);
  const values =
    scheme === "llm_trace"
      ? [events.length.toLocaleString("zh-CN"), modelCalls.toLocaleString("zh-CN"), checks.toLocaleString("zh-CN"), formatDuration(totalDuration)]
      : scheme === "tool_timeline"
        ? [events.length.toLocaleString("zh-CN"), executionCount.toLocaleString("zh-CN"), failures.toLocaleString("zh-CN"), formatDuration(totalDuration)]
        : [events.length.toLocaleString("zh-CN"), executionCount.toLocaleString("zh-CN"), failures.toLocaleString("zh-CN"), formatDuration(totalDuration)];

  statsGrid.querySelectorAll("dd").forEach((node, index) => {
    node.textContent = values[index];
  });

  trackMeta.textContent = events.length
    ? `${formatTime(events[0].time)} -> ${formatTime(events.at(-1).time)}`
    : "等待加载运行数据";
}

function updateStatsLabels() {
  const labels =
    currentSchemeKey() === "llm_trace"
      ? ["节点数", "模型调用", "检查", "总耗时"]
      : currentSchemeKey() === "tool_timeline"
        ? ["节点数", "工具/命令", "失败", "总耗时"]
        : ["事件数", "执行节点", "失败", "总耗时"];

  statsGrid.querySelectorAll("dt").forEach((node, index) => {
    node.textContent = labels[index];
  });
}

function updateDetails(event) {
  if (!event) {
    detailPanel.innerHTML = "<p class=\"muted\">选择一个节点查看事件详情。</p>";
    return;
  }

  const metadataHtml = renderMetadata(event.metadata);
  const payloadHtml = escapeHtml(JSON.stringify(event.payload, null, 2));

  detailPanel.innerHTML = `
    <div class="detail-heading">
      <span class="type-pill" style="background:${categoryColor(event.category)}">${escapeHtml(typeLabel(event.type))}</span>
      <strong>${escapeHtml(event.name)}</strong>
    </div>
    <dl class="detail-list">
      <div><dt>类型</dt><dd>${escapeHtml(event.type)}</dd></div>
      <div><dt>分类</dt><dd>${escapeHtml(categoryLabel(event.category))}</dd></div>
      <div><dt>时间</dt><dd>${escapeHtml(formatTime(event.time))}</dd></div>
      <div><dt>耗时</dt><dd>${escapeHtml(formatDuration(event.durationMs))}</dd></div>
      <div><dt>状态</dt><dd>${escapeHtml(event.status)}</dd></div>
      <div><dt>ID</dt><dd>${escapeHtml(event.id)}</dd></div>
    </dl>
    <pre class="event-content">${escapeHtml(String(event.content || "无内容"))}</pre>
    ${metadataHtml}
    <details class="payload-details">
      <summary>原始事件</summary>
      <pre class="event-content">${payloadHtml}</pre>
    </details>
  `;
}

function updateTimelineLabel(event) {
  timeOutput.textContent = event ? `${event.index + 1}/${events.length} ${event.name}` : "未播放";
}

function categoryLabel(category) {
  return laneSchemes.event_flow.find((lane) => lane.key === category)?.label || "Reasoning";
}

function typeLabel(type) {
  return String(type || "agent")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function categoryColor(category) {
  return laneSchemes.event_flow.find((lane) => lane.key === category)?.color || laneSchemes.event_flow[1].color;
}

function renderMetadata(metadata) {
  const entries = Object.entries(metadata || {});
  if (!entries.length) return "";

  const rows = entries
    .map(([key, value]) => {
      const rendered = isPlainObject(value) || Array.isArray(value) ? JSON.stringify(value, null, 2) : String(value);
      return `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(rendered)}</dd></div>`;
    })
    .join("");

  return `
    <section class="metadata-section">
      <h3>扩展字段</h3>
      <dl class="detail-list metadata-list">${rows}</dl>
    </section>
  `;
}

function formatDuration(ms) {
  if (!ms) return "0 ms";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`;
  return `${(ms / 60000).toFixed(1)} min`;
}

function formatTime(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("zh-CN") : String(value);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" };
    return entities[char];
  });
}

function clearTrace() {
  events = [];
  positioned = [];
  pendingRawEvents = [];
  pendingTraceName = "";
  discoveredFields = [];
  hoverIndex = -1;
  selectedIndex = 0;
  fileInput.value = "";
  mappingPanel.hidden = true;
  mappingRows.innerHTML = "";
  trackName.textContent = "未加载运行轨迹";
  trackMeta.textContent = "等待加载运行数据";
  emptyState.hidden = false;
  updateStats();
  updateDetails(null);
  stopPlayback();
  draw();
}

async function handleFile(file) {
  const text = await file.text();
  const rawEvents = parseTrace(text);
  prepareTraceMapping(rawEvents, file.name);
}

function stopPlayback() {
  window.clearInterval(playTimer);
  playTimer = null;
  playBtn.textContent = "▶";
}

fileInput.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  try {
    await handleFile(file);
  } catch (error) {
    alert(error.message);
  }
});

loadSampleBtn.addEventListener("click", () => {
  const sample = sampleTraces[sampleSelect.value] || sampleTraces.debug;
  prepareTraceMapping(sample.events, sample.name, true);
});

clearBtn.addEventListener("click", clearTrace);

applyMappingBtn.addEventListener("click", applyCurrentMapping);

[colorMode, showLabels, showGrid, timeSlider].forEach((control) => {
  control.addEventListener("input", draw);
});

schemeSelect.addEventListener("change", () => {
  if (!pendingRawEvents.length) return;
  renderMappingPanel();
  applyCurrentMapping({ silent: true });
});

playBtn.addEventListener("click", () => {
  if (playTimer) {
    stopPlayback();
    return;
  }
  playBtn.textContent = "Ⅱ";
  timeSlider.value = "0";
  playTimer = window.setInterval(() => {
    const next = Number(timeSlider.value) + 3;
    timeSlider.value = String(next);
    draw();
    if (next >= 100) stopPlayback();
  }, 120);
});

canvas.addEventListener("mousemove", (event) => {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const visibleCount = Math.ceil((positioned.length * Number(timeSlider.value)) / 100);
  const visible = positioned.slice(0, visibleCount);
  hoverIndex = visible.findIndex((item) => Math.hypot(item.x - x, item.y - y) < item.radius + 6);

  if (hoverIndex >= 0) {
    const item = visible[hoverIndex];
    tooltip.hidden = false;
    tooltip.style.left = `${Math.min(x + 14, rect.width - 260)}px`;
    tooltip.style.top = `${Math.max(y - 18, 12)}px`;
    tooltip.innerHTML = `
      <strong>${escapeHtml(item.name)}</strong><br>
      类型：${escapeHtml(typeLabel(item.type))}<br>
      分类：${escapeHtml(categoryLabel(item.category))}<br>
      状态：${escapeHtml(item.status)}<br>
      耗时：${escapeHtml(formatDuration(item.durationMs))}
    `;
  } else {
    tooltip.hidden = true;
  }
  draw();
});

canvas.addEventListener("click", () => {
  if (hoverIndex < 0) return;
  selectedIndex = hoverIndex;
  updateDetails(positioned[selectedIndex]);
  draw();
});

canvas.addEventListener("mouseleave", () => {
  hoverIndex = -1;
  tooltip.hidden = true;
  draw();
});

sampleSelect.addEventListener("change", () => {
  const sample = sampleTraces[sampleSelect.value] || sampleTraces.debug;
  prepareTraceMapping(sample.events, sample.name, true);
});

window.addEventListener("resize", resizeCanvas);

prepareTraceMapping(sampleTraces.debug.events, sampleTraces.debug.name, true);
