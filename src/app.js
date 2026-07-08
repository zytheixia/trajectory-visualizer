const canvas = document.querySelector("#trackCanvas");
const ctx = canvas.getContext("2d");
const fileInput = document.querySelector("#fileInput");
const sampleSelect = document.querySelector("#sampleSelect");
const loadSampleBtn = document.querySelector("#loadSampleBtn");
const clearBtn = document.querySelector("#clearBtn");
const colorMode = document.querySelector("#colorMode");
const showLabels = document.querySelector("#showLabels");
const showGrid = document.querySelector("#showGrid");
const statsGrid = document.querySelector("#statsGrid");
const detailPanel = document.querySelector("#detailPanel");
const trackName = document.querySelector("#trackName");
const trackMeta = document.querySelector("#trackMeta");
const emptyState = document.querySelector("#emptyState");
const tooltip = document.querySelector("#tooltip");
const playBtn = document.querySelector("#playBtn");
const timeSlider = document.querySelector("#timeSlider");
const timeOutput = document.querySelector("#timeOutput");

const lanes = [
  { key: "input", label: "Input", color: "#2563eb" },
  { key: "reasoning", label: "Reasoning", color: "#7c3aed" },
  { key: "execution", label: "Execution", color: "#059669" },
  { key: "observation", label: "Observation", color: "#475569" },
  { key: "failure", label: "Failure", color: "#dc2626" }
];

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

function normalizeEvents(rawEvents) {
  return rawEvents
    .map((event, index) => {
      const rawType = readField(event, "type") || readField(event, "category") || "agent";
      const type = normalizeType(rawType);
      const category = normalizeCategory(readField(event, "category") || rawType);
      const time = parseTime(readField(event, "time"), index);
      const durationValue = readField(event, "duration") ?? 0;
      const duration = Number(durationValue);
      const durationMs = Number.isFinite(duration)
        ? isMillisecondDurationField(event)
          ? duration
          : duration * 1000
        : 0;
      const status = String(readField(event, "status") || "success").toLowerCase();
      return {
        id: readField(event, "id") || `event-${index + 1}`,
        type,
        category,
        lane: category,
        name: readField(event, "name") || typeLabel(type),
        content: readField(event, "content") || "",
        time,
        rawTime: readField(event, "time") || "",
        durationMs,
        status,
        metadata: collectMetadata(event),
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

function readField(event, canonicalName) {
  const aliases = fieldAliases[canonicalName] || [canonicalName];
  const key = aliases.find((alias) => event[alias] !== undefined && event[alias] !== null && event[alias] !== "");
  return key ? event[key] : undefined;
}

function isMillisecondDurationField(event) {
  return ["duration_ms", "elapsed_ms", "latency_ms"].some((key) => event[key] !== undefined);
}

function normalizeCategory(value) {
  const key = normalizeType(value);
  return categoryAliases[key] || "reasoning";
}

function collectMetadata(event) {
  const reserved = new Set(Object.values(fieldAliases).flat());
  const mappedMetadata = readField(event, "metadata");
  const metadata = { ...(isPlainObject(mappedMetadata) ? mappedMetadata : {}) };
  Object.entries(event).forEach(([key, value]) => {
    if (!reserved.has(key)) metadata[key] = value;
  });
  return metadata;
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

function loadTrace(rawEvents, name) {
  events = normalizeEvents(rawEvents);
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

function resizeCanvas() {
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

function layoutEvents() {
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
    const laneIndex = lanes.findIndex((lane) => lane.key === event.lane);
    const fallbackX = left + (usableWidth * index) / Math.max(events.length - 1, 1);
    const timeX = left + ((event.time - firstTime) / duration) * usableWidth;
    return {
      ...event,
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
  const lane = lanes.find((item) => item.key === event.lane) || lanes[1];
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
  if (colorMode.value === "type") {
    return lanes.find((lane) => lane.key === event.lane)?.color || "#1267d8";
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
  const toolCalls = events.filter((event) => event.category === "execution").length;
  const failures = events.filter((event) => event.category === "failure" || event.status === "failed").length;
  const totalDuration = events.reduce((sum, event) => sum + event.durationMs, 0);
  const values = [
    events.length.toLocaleString("zh-CN"),
    toolCalls.toLocaleString("zh-CN"),
    failures.toLocaleString("zh-CN"),
    formatDuration(totalDuration)
  ];

  statsGrid.querySelectorAll("dd").forEach((node, index) => {
    node.textContent = values[index];
  });

  trackMeta.textContent = events.length
    ? `${formatTime(events[0].time)} -> ${formatTime(events.at(-1).time)}`
    : "等待加载运行数据";
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
  return lanes.find((lane) => lane.key === category)?.label || "Reasoning";
}

function typeLabel(type) {
  return String(type || "agent")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function categoryColor(category) {
  return lanes.find((lane) => lane.key === category)?.color || lanes[1].color;
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
  hoverIndex = -1;
  selectedIndex = 0;
  fileInput.value = "";
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
  loadTrace(rawEvents, file.name);
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
  loadTrace(sample.events, sample.name);
});

clearBtn.addEventListener("click", clearTrace);

[colorMode, showLabels, showGrid, timeSlider].forEach((control) => {
  control.addEventListener("input", draw);
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
  loadTrace(sample.events, sample.name);
});

window.addEventListener("resize", resizeCanvas);

loadTrace(sampleTraces.debug.events, sampleTraces.debug.name);
