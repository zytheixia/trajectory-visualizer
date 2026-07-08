const canvas = document.querySelector("#trackCanvas");
const ctx = canvas.getContext("2d");
const fileInput = document.querySelector("#fileInput");
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
  { key: "user", label: "User", color: "#2563eb" },
  { key: "agent", label: "Agent", color: "#7c3aed" },
  { key: "tool", label: "Tool", color: "#059669" },
  { key: "system", label: "System", color: "#475569" },
  { key: "error", label: "Error", color: "#dc2626" }
];

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

const sampleEvents = [
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
    type: "agent",
    name: "规划",
    content: "读取测试输出，定位失败路径，优先复现最小问题。",
    time: "2026-07-08T09:00:08Z",
    duration: 12,
    status: "success"
  },
  {
    id: "evt-3",
    type: "tool",
    name: "rg",
    content: "搜索 failing assertion 和相关 fixture。",
    time: "2026-07-08T09:00:24Z",
    duration: 3,
    status: "success"
  },
  {
    id: "evt-4",
    type: "agent",
    name: "观察",
    content: "发现 parser 对缺失 optional 字段处理不一致。",
    time: "2026-07-08T09:00:32Z",
    status: "success"
  },
  {
    id: "evt-5",
    type: "tool",
    name: "pytest",
    content: "运行 tests/test_harbor_parser.py::test_missing_optional_fields。",
    time: "2026-07-08T09:00:46Z",
    duration: 8,
    status: "failed"
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
    type: "agent",
    name: "修复",
    content: "统一 normalize 阶段的默认值，并补充回归测试。",
    time: "2026-07-08T09:01:11Z",
    duration: 45,
    status: "success"
  },
  {
    id: "evt-8",
    type: "tool",
    name: "pytest",
    content: "运行相关测试文件。",
    time: "2026-07-08T09:02:02Z",
    duration: 14,
    status: "success"
  },
  {
    id: "evt-9",
    type: "agent",
    name: "总结",
    content: "报告修改点、验证结果和剩余风险。",
    time: "2026-07-08T09:02:24Z",
    status: "success"
  }
];

function parseTrace(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.events)) return parsed.events;
    if (Array.isArray(parsed.trace)) return parsed.trace;
    if (Array.isArray(parsed.steps)) return parsed.steps;
  } catch {
    if (!trimmed.includes("\n")) throw new Error("无法解析 JSON 运行轨迹。");
    return trimmed
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }

  throw new Error("JSON 需要是事件数组，或包含 events / trace / steps 数组。");
}

function normalizeEvents(rawEvents) {
  return rawEvents
    .map((event, index) => {
      const type = normalizeType(event.type || event.role || event.kind || event.category);
      const time = parseTime(event.time || event.timestamp || event.started_at || event.created_at, index);
      const duration = Number(event.duration ?? event.duration_ms ?? event.elapsed_ms ?? 0);
      const durationMs = Number.isFinite(duration)
        ? event.duration_ms || event.elapsed_ms
          ? duration
          : duration * 1000
        : 0;
      const status = String(event.status || event.outcome || "success").toLowerCase();
      return {
        id: event.id || event.event_id || `event-${index + 1}`,
        type,
        lane: type,
        name: event.name || event.title || event.tool || event.action || laneLabel(type),
        content: event.content || event.message || event.input || event.output || event.summary || "",
        time,
        rawTime: event.time || event.timestamp || "",
        durationMs,
        status,
        raw: event
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
  const type = String(value || "").toLowerCase();
  if (["human", "user", "request"].includes(type)) return "user";
  if (["assistant", "agent", "thought", "reasoning", "plan"].includes(type)) return "agent";
  if (["tool", "function", "command", "action"].includes(type)) return "tool";
  if (["system", "observation", "result"].includes(type)) return "system";
  if (["error", "exception", "failed", "failure"].includes(type)) return "error";
  return "agent";
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
      radius: event.type === "error" || event.status === "failed" ? 13 : 10
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
  const toolCalls = events.filter((event) => event.type === "tool").length;
  const failures = events.filter((event) => event.type === "error" || event.status === "failed").length;
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

  detailPanel.innerHTML = `
    <div class="detail-heading">
      <span class="type-pill type-${event.type}">${laneLabel(event.type)}</span>
      <strong>${escapeHtml(event.name)}</strong>
    </div>
    <dl class="detail-list">
      <div><dt>时间</dt><dd>${escapeHtml(formatTime(event.time))}</dd></div>
      <div><dt>耗时</dt><dd>${escapeHtml(formatDuration(event.durationMs))}</dd></div>
      <div><dt>状态</dt><dd>${escapeHtml(event.status)}</dd></div>
      <div><dt>ID</dt><dd>${escapeHtml(event.id)}</dd></div>
    </dl>
    <pre class="event-content">${escapeHtml(String(event.content || "无内容"))}</pre>
  `;
}

function updateTimelineLabel(event) {
  timeOutput.textContent = event ? `${event.index + 1}/${events.length} ${event.name}` : "未播放";
}

function laneLabel(type) {
  return lanes.find((lane) => lane.key === type)?.label || "Agent";
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
  loadTrace(sampleEvents, "Agent 调试示例");
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
      类型：${escapeHtml(laneLabel(item.type))}<br>
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

window.addEventListener("resize", resizeCanvas);

loadTrace(sampleEvents, "Agent 调试示例");
