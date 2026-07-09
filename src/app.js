import {
  fieldAliases,
  laneSchemes,
  visualizationSchemes
} from "./config/traceConfig.js";
import { sampleTraces } from "./config/sampleTraces.js";
import { createMappingAdapter } from "./adapters/index.js";
import { discoverFields, isPlainObject, parseTrace } from "./core/traceModel.js";
import { AgentTraceViewer } from "./viewer/AgentTraceViewer.js";

const canvas = document.querySelector("#trackCanvas");
const fileInput = document.querySelector("#fileInput");
const sampleSelect = document.querySelector("#sampleSelect");
const loadSampleBtn = document.querySelector("#loadSampleBtn");
const clearBtn = document.querySelector("#clearBtn");
const schemeSelect = document.querySelector("#schemeSelect");
const layoutSelect = document.querySelector("#layoutSelect");
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

let events = [];
let playTimer = null;
let pendingRawEvents = [];
let pendingTraceName = "";
let discoveredFields = [];

const viewer = new AgentTraceViewer(canvas, {
  layoutKey: currentLayoutKey(),
  schemeKey: currentSchemeKey(),
  colorMode: colorMode.value,
  showLabels: showLabels.checked,
  showGrid: showGrid.checked,
  progress: Number(timeSlider.value),
  onRender: (lastVisible) => updateTimelineLabel(lastVisible),
  onNodeHover: (node, context) => updateTooltip(node, context),
  onNodeClick: (node) => {
    updateDetails(node);
    openDetailSidebar();
  }
});

function currentSchemeKey() {
  return schemeSelect.value || "event_flow";
}

function currentLayoutKey() {
  return layoutSelect.value || "swimlane";
}

function loadTrace(rawEvents, name, fieldMapping = null) {
  const adapter = createMappingAdapter(fieldMapping || {});
  events = adapter(rawEvents);
  if (events.length < 1) throw new Error("至少需要一个有效事件。");
  timeSlider.value = "100";
  trackName.textContent = name;
  emptyState.hidden = true;
  updateStats();
  updateDetails(events[0]);
  viewer.setOptions(viewerOptions());
  viewer.setEvents(events);
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

function viewerOptions() {
  return {
    layoutKey: currentLayoutKey(),
    schemeKey: currentSchemeKey(),
    colorMode: colorMode.value,
    showLabels: showLabels.checked,
    showGrid: showGrid.checked,
    progress: Number(timeSlider.value)
  };
}

function updateViewerOptions() {
  viewer.setOptions(viewerOptions());
}

function resizeCanvas() {
  viewer.resize();
}

function draw() {
  viewer.draw();
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
      <div><dt>角色</dt><dd>${escapeHtml(event.actor || "-")}</dd></div>
      <div><dt>父节点</dt><dd>${escapeHtml(event.parentId || "-")}</dd></div>
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

function updateTooltip(node, context) {
  if (!node) {
    tooltip.hidden = true;
    return;
  }

  tooltip.hidden = false;
  tooltip.style.left = `${Math.min(context.x + 14, context.rect.width - 260)}px`;
  tooltip.style.top = `${Math.max(context.y - 18, 12)}px`;
  tooltip.innerHTML = `
    <strong>${escapeHtml(node.name)}</strong><br>
    类型：${escapeHtml(typeLabel(node.type))}<br>
    分类：${escapeHtml(categoryLabel(node.category))}<br>
    状态：${escapeHtml(node.status)}<br>
    耗时：${escapeHtml(formatDuration(node.durationMs))}
  `;
}

function openDetailSidebar() {
  const detailSidebar = document.querySelector("#detailSidebar");
  const appShell = document.querySelector(".app-shell");
  if (detailSidebar && appShell) {
    detailSidebar.classList.remove("collapsed");
    appShell.classList.remove("detail-collapsed");
    setTimeout(resizeCanvas, 150);
  }
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
  pendingRawEvents = [];
  pendingTraceName = "";
  discoveredFields = [];
  fileInput.value = "";
  mappingPanel.hidden = true;
  mappingRows.innerHTML = "";
  trackName.textContent = "未加载运行轨迹";
  trackMeta.textContent = "等待加载运行数据";
  emptyState.hidden = false;
  updateStats();
  updateDetails(null);
  stopPlayback();
  viewer.setEvents([]);
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
  control.addEventListener("input", updateViewerOptions);
});

layoutSelect.addEventListener("change", () => {
  updateViewerOptions();
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
  updateViewerOptions();
  playTimer = window.setInterval(() => {
    const next = Number(timeSlider.value) + 3;
    timeSlider.value = String(next);
    updateViewerOptions();
    if (next >= 100) stopPlayback();
  }, 120);
});

// Canvas zoom button controls
const zoomInBtn = document.querySelector("#zoomInBtn");
const zoomOutBtn = document.querySelector("#zoomOutBtn");
const zoomResetBtn = document.querySelector("#zoomResetBtn");

if (zoomInBtn && zoomOutBtn && zoomResetBtn) {
  zoomInBtn.addEventListener("click", () => viewer.zoomIn());
  zoomOutBtn.addEventListener("click", () => viewer.zoomOut());
  zoomResetBtn.addEventListener("click", () => viewer.resetZoom());
}

// Close details sidebar controls
const closeDetailBtn = document.querySelector("#closeDetailBtn");
const detailSidebar = document.querySelector("#detailSidebar");
const appShell = document.querySelector(".app-shell");

if (closeDetailBtn && detailSidebar && appShell) {
  closeDetailBtn.addEventListener("click", () => {
    detailSidebar.classList.add("collapsed");
    appShell.classList.add("detail-collapsed");
    setTimeout(resizeCanvas, 150);
  });
}

sampleSelect.addEventListener("change", () => {
  const sample = sampleTraces[sampleSelect.value] || sampleTraces.debug;
  prepareTraceMapping(sample.events, sample.name, true);
});

window.addEventListener("resize", resizeCanvas);

// Initialize
prepareTraceMapping(sampleTraces.debug.events, sampleTraces.debug.name, true);
