import {
  fieldAliases,
  laneSchemes,
  visualizationSchemes
} from "./config/traceConfig.js";
import { sampleTraces } from "./config/sampleTraces.js";
import { sampleComparisons } from "./config/sampleComparisons.js";
import { adapters, createMappingAdapter } from "./adapters/index.js";
import { discoverFields, isPlainObject, parseTrace } from "./core/traceModel.js";
import { AgentTraceViewer } from "./viewer/single/AgentTraceViewer.js";
import { TraceComparisonViewer } from "./viewer/multi/TraceComparisonViewer.js";

const canvas = document.querySelector("#trackCanvas");
const fileInput = document.querySelector("#fileInput");
const sampleSelect = document.querySelector("#sampleSelect");
const loadSampleBtn = document.querySelector("#loadSampleBtn");
const clearBtn = document.querySelector("#clearBtn");
const adapterSelect = document.querySelector("#adapterSelect");
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

// New Mode & Findings Selector
const modeSelect = document.querySelector("#modeSelect");
const schemeSelectLine = document.querySelector("#schemeSelectLine");
const layoutSelectLine = document.querySelector("#layoutSelectLine");
const findingsPanel = document.querySelector("#findingsPanel");
const findingsList = document.querySelector("#findingsList");

let currentMode = "single"; // "single" | "compare"
let activeComparison = null;
let events = [];
let playTimer = null;
let pendingRawEvents = [];
let pendingTraceName = "";
let discoveredFields = [];

// Focus/Crop state variables
let traceCropRanges = {};
let traceSelectedEvents = {};
let originalEvents = null;
let originalComparison = null;

const viewer = new AgentTraceViewer(canvas, {
  layoutKey: currentLayoutKey(),
  schemeKey: currentSchemeKey(),
  colorMode: colorMode.value,
  showLabels: showLabels.checked,
  showGrid: showGrid.checked,
  progress: Number(timeSlider.value),
  onRender: (lastVisible) => {
    if (currentMode === "single") updateTimelineLabel(lastVisible);
  },
  onNodeHover: (node, context) => {
    if (currentMode === "single") updateTooltip(node, context);
  },
  onNodeClick: (node) => {
    if (currentMode === "single") {
      handleNodeSelection(node, "single");
      updateDetails(node);
      openDetailSidebar();
    }
  },
  onRangeClick: (traceId, e1, e2) => {
    if (currentMode === "single") {
      handleRangeClick(traceId, e1, e2);
    }
  }
});

const comparisonViewer = new TraceComparisonViewer(canvas, {
  progress: Number(timeSlider.value),
  showLabels: showLabels.checked,
  showGrid: showGrid.checked,
  onRender: (lastVisible) => {
    if (currentMode === "compare") updateTimelineLabel(lastVisible);
  },
  onNodeHover: (node, context) => {
    if (currentMode === "compare") updateTooltip(node, context);
  },
  onNodeClick: (node, traceId) => {
    if (currentMode === "compare") {
      handleNodeSelection(node, traceId);
      updateDetails(node);
      openDetailSidebar();
    }
  },
  onRangeClick: (traceId, e1, e2) => {
    if (currentMode === "compare") {
      handleRangeClick(traceId, e1, e2);
    }
  },
  onTraceResetClick: (traceId) => {
    if (currentMode === "compare") {
      resetTraceCrop(traceId);
    }
  }
});

viewer.enabled = true;
comparisonViewer.enabled = false;

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
  draw();
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
  if (currentMode === "compare") {
    comparisonViewer.setOptions({
      progress: Number(timeSlider.value),
      showLabels: showLabels.checked,
      showGrid: showGrid.checked,
      colorMode: colorMode.value,
      traceSelectedEvents: traceSelectedEvents,
      traceCropRanges: traceCropRanges
    });
  } else {
    viewer.setOptions({
      ...viewerOptions(),
      selectedEvents: traceSelectedEvents["single"] || []
    });
  }
  draw();
}

function resizeCanvas() {
  if (currentMode === "compare") {
    comparisonViewer.resize();
  } else {
    viewer.resize();
  }
  draw();
}

function draw() {
  const layout = currentLayoutKey();
  const canvasElement = document.querySelector("#trackCanvas");
  const cardsView = document.querySelector("#cardsView");
  const canvasControls = document.querySelector("#canvasControls");

  if (currentMode === "compare") {
    if (canvasElement) canvasElement.style.display = "block";
    if (canvasControls) canvasControls.style.display = "flex";
    if (cardsView) cardsView.hidden = true;
    comparisonViewer.draw();
    return;
  }

  if (layout === "cards") {
    if (canvasElement) canvasElement.style.display = "none";
    if (canvasControls) canvasControls.style.display = "none";
    if (cardsView) {
      cardsView.hidden = false;
      const visibleCount = Math.max(0, Math.ceil((events.length * Number(timeSlider.value)) / 100));
      const visible = events.slice(0, visibleCount);
      renderCardsView(visible);
    }
  } else {
    if (canvasElement) canvasElement.style.display = "block";
    if (canvasControls) canvasControls.style.display = "flex";
    if (cardsView) cardsView.hidden = true;
    viewer.draw();
  }
}

function renderCardsView(visibleEvents) {
  const container = document.querySelector("#cardsView .cards-view-inner");
  if (!container) return;

  if (!visibleEvents.length) {
    container.innerHTML = `<div class="muted" style="text-align:center;padding:40px 0;">当前时间段无事件，请拖动下方进度条。</div>`;
    return;
  }

  container.innerHTML = visibleEvents.map((event) => {
    const isLlm = event.type.includes("llm") || 
                  event.type.includes("model") || 
                  event.metadata?.model || 
                  event.metadata?.prompt_tokens;

    const excludeKeys = isLlm 
      ? ["model", "provider", "prompt_tokens", "completion_tokens", "total_tokens", "tokens", "cost_usd", "cost", "temperature", "top_p", "messages", "prompt", "completion"]
      : [];

    const llmDashboardHtml = isLlm ? renderLlmDashboard(event.metadata) : "";
    const chatBubblesHtml = isLlm && event.metadata?.messages ? renderChatBubbles(event.metadata.messages) : "";
    
    let promptCompletionHtml = "";
    if (isLlm && !event.metadata?.messages) {
      const promptText = event.metadata?.prompt || "";
      const completionText = event.metadata?.completion || "";
      if (promptText || completionText) {
        promptCompletionHtml = `
          <div class="chat-bubbles-container">
            ${promptText ? `<div class="chat-bubble user"><span class="role">Prompt</span><div>${escapeHtml(promptText)}</div></div>` : ""}
            ${completionText ? `<div class="chat-bubble assistant"><span class="role">Completion</span><div>${escapeHtml(completionText)}</div></div>` : ""}
          </div>
        `;
      }
    }

    const metadataHtml = renderMetadata(event.metadata, excludeKeys);
    const payloadHtml = escapeHtml(JSON.stringify(event.payload, null, 2));

    const statusColor = event.status === "failed" || event.status === "error" ? "#ef4444" : event.status === "running" ? "#f59e0b" : "#10b981";

    let bodyContent = "";
    if (event.category === "execution") {
      const cmd = event.metadata?.command || event.content || "";
      bodyContent = `
        <div class="card-terminal-block">
          <div class="terminal-header">Command / Action</div>
          <pre class="terminal-content">$ ${escapeHtml(cmd)}</pre>
        </div>
      `;
    } else if (event.category === "observation") {
      bodyContent = `
        <div class="card-terminal-block observation">
          <div class="terminal-header">Observation / Result</div>
          <pre class="terminal-content">${escapeHtml(event.content || "无内容")}</pre>
        </div>
      `;
    } else if (chatBubblesHtml || promptCompletionHtml) {
      bodyContent = chatBubblesHtml + promptCompletionHtml;
    } else {
      bodyContent = `<p class="card-text-content">${escapeHtml(String(event.content || "无内容"))}</p>`;
    }

    const isSelected = event.index === viewer.selectedIndex;

    return `
      <div class="step-card ${event.status} ${isSelected ? 'selected' : ''}" 
           style="border-left: 4px solid ${statusColor}" 
           data-index="${event.index}">
        <div class="step-card-header">
          <div class="header-left">
            <span class="step-index-badge">#${event.index + 1}</span>
            <span class="step-type-pill" style="background:${categoryColor(event.category)}">${escapeHtml(typeLabel(event.type))}</span>
            <strong class="step-name">${escapeHtml(event.name)}</strong>
          </div>
          <div class="header-right">
            <span class="step-actor">${escapeHtml(event.actor || "System")}</span>
            <span class="step-duration">${escapeHtml(formatDuration(event.durationMs))}</span>
          </div>
        </div>
        
        <div class="step-card-body">
          ${bodyContent}
          ${llmDashboardHtml}
          ${metadataHtml}
        </div>
        
        <div class="step-card-footer">
          <details class="payload-details">
            <summary>原始事件 JSON</summary>
            <pre class="event-content">${payloadHtml}</pre>
          </details>
        </div>
      </div>
    `;
  }).join("");

  container.querySelectorAll(".step-card").forEach(card => {
    card.addEventListener("click", (e) => {
      if (e.target.closest("details")) return;
      
      const idx = parseInt(card.dataset.index);
      viewer.selectedIndex = idx;
      updateDetails(events[viewer.selectedIndex]);
      
      container.querySelectorAll(".step-card").forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
    });
  });
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

  const isLlmEvent = event.type.includes("llm") || 
                     event.type.includes("model") || 
                     event.metadata?.model || 
                     event.metadata?.prompt_tokens;

  const excludeKeys = isLlmEvent 
    ? ["model", "provider", "prompt_tokens", "completion_tokens", "total_tokens", "tokens", "cost_usd", "cost", "temperature", "top_p", "max_tokens", "messages", "prompt", "completion"]
    : [];

  const llmDashboardHtml = isLlmEvent ? renderLlmDashboard(event.metadata) : "";
  const chatBubblesHtml = isLlmEvent && event.metadata?.messages ? renderChatBubbles(event.metadata.messages) : "";
  
  // Prompt/Completion preview if present in metadata
  let promptCompletionHtml = "";
  if (isLlmEvent && !event.metadata?.messages) {
    const promptText = event.metadata?.prompt || "";
    const completionText = event.metadata?.completion || "";
    if (promptText || completionText) {
      promptCompletionHtml = `
        <div class="chat-bubbles-container">
          ${promptText ? `<div class="chat-bubble user"><span class="role">Prompt</span><div>${escapeHtml(promptText)}</div></div>` : ""}
          ${completionText ? `<div class="chat-bubble assistant"><span class="role">Completion</span><div>${escapeHtml(completionText)}</div></div>` : ""}
        </div>
      `;
    }
  }

  const metadataHtml = renderMetadata(event.metadata, excludeKeys);
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
    
    ${llmDashboardHtml}
    
    ${chatBubblesHtml || promptCompletionHtml ? (chatBubblesHtml + promptCompletionHtml) : `
      <pre class="event-content">${escapeHtml(String(event.content || "无内容"))}</pre>
    `}
    
    ${metadataHtml}
    <details class="payload-details">
      <summary>原始事件</summary>
      <pre class="event-content">${payloadHtml}</pre>
    </details>
  `;

  // Append crop guide tooltip to detail panel
  const container = document.createElement("div");
  container.innerHTML = `
    <div class="crop-tip" style="margin-top: 16px; padding: 10px; background: #eff6ff; border: 1px dashed #bfdbfe; border-radius: 4px; font-size: 11px; color: #1e40af; line-height: 1.5;">
      💡 <strong>局部聚焦提示</strong>：<br>
      在画布上选择<b>两个不同的节点</b>，它们之间会以蓝色虚线和背景高亮。点击高亮区域即可立刻聚焦该区间。
    </div>
  `;
  detailPanel.appendChild(container);
}

function renderLlmDashboard(metadata) {
  if (!metadata) return "";
  const model = metadata.model || "Unknown Model";
  const provider = metadata.provider || (model.toLowerCase().startsWith("gpt") || model.toLowerCase().startsWith("o1") ? "openai" : model.toLowerCase().startsWith("claude") ? "anthropic" : "unknown");
  
  // Tokens
  const promptTokens = Number(metadata.prompt_tokens || metadata.input_tokens || 0);
  const completionTokens = Number(metadata.completion_tokens || metadata.output_tokens || 0);
  const totalTokens = Number(metadata.total_tokens || metadata.tokens || (promptTokens + completionTokens));
  
  // Cost
  let costStr = "";
  if (metadata.cost_usd !== undefined || metadata.cost !== undefined) {
    const costVal = Number(metadata.cost_usd ?? metadata.cost);
    costStr = costVal < 0.0001 ? `$${costVal.toFixed(6)}` : `$${costVal.toFixed(4)}`;
  }
  
  // Token Bar width calculation
  const totalSum = promptTokens + completionTokens || 1;
  const promptPct = ((promptTokens / totalSum) * 100).toFixed(1);
  const completionPct = ((completionTokens / totalSum) * 100).toFixed(1);

  // Hyperparameters
  const params = [];
  if (metadata.temperature !== undefined) params.push(`Temp: ${metadata.temperature}`);
  if (metadata.top_p !== undefined) params.push(`Top P: ${metadata.top_p}`);
  if (metadata.max_tokens !== undefined) params.push(`Max Tokens: ${metadata.max_tokens}`);

  const paramsHtml = params.length 
    ? `<div class="llm-params-row">${params.map(p => `<span class="llm-param-pill">${escapeHtml(p)}</span>`).join("")}</div>`
    : "";

  return `
    <section class="llm-dashboard">
      <div class="llm-model-header">
        <span class="llm-model-name">${escapeHtml(model)}</span>
        <span class="llm-provider-badge" style="background:${provider === "openai" ? "#e0f2fe;color:#0369a1;" : provider === "anthropic" ? "#fef3c7;color:#b45309;" : "#f1f5f9;color:#475569;"}">${escapeHtml(provider)}</span>
      </div>
      
      <div class="llm-metrics-grid">
        ${totalTokens ? `
          <div class="llm-metric-card">
            <span class="label">Tokens</span>
            <span class="value">${totalTokens.toLocaleString()}</span>
          </div>
        ` : ""}
        ${costStr ? `
          <div class="llm-metric-card">
            <span class="label">估算成本</span>
            <span class="value" style="color:#10b981;">${costStr}</span>
          </div>
        ` : ""}
      </div>

      ${(promptTokens || completionTokens) ? `
        <div class="llm-token-bar-wrapper">
          <div class="llm-token-bar-track">
            <div class="llm-token-bar-prompt" style="width: ${promptPct}%" title="Prompt: ${promptPct}%"></div>
            <div class="llm-token-bar-completion" style="width: ${completionPct}%" title="Completion: ${completionPct}%"></div>
          </div>
          <div class="llm-token-labels">
            <span>输入: ${promptTokens.toLocaleString()} (${promptPct}%)</span>
            <span>输出: ${completionTokens.toLocaleString()} (${completionPct}%)</span>
          </div>
        </div>
      ` : ""}

      ${paramsHtml}
    </section>
  `;
}

function renderChatBubbles(messages) {
  if (!Array.isArray(messages)) return "";
  
  const bubbles = messages.map(msg => {
    const role = msg.role || "unknown";
    const content = msg.content || "";
    return `
      <div class="chat-bubble ${escapeHtml(role)}">
        <span class="role">${escapeHtml(role)}</span>
        <div>${escapeHtml(content)}</div>
      </div>
    `;
  }).join("");

  return `
    <div class="chat-bubbles-container">
      <h3>对话记录</h3>
      ${bubbles}
    </div>
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

function renderMetadata(metadata, excludeKeys = []) {
  const excludeSet = new Set(excludeKeys);
  const entries = Object.entries(metadata || {}).filter(([key]) => !excludeSet.has(key));
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
  clearCropState();
}

function isMultiTraceData(parsed) {
  if (!parsed || typeof parsed !== "object") return false;
  if (Array.isArray(parsed.traces) && parsed.traces.length > 1) return true;
  if (parsed.comparison && Array.isArray(parsed.comparison.traces) && parsed.comparison.traces.length > 1) return true;
  if (Array.isArray(parsed) && parsed.length > 1 && parsed[0] && typeof parsed[0] === "object" && (parsed[0].traceId || Array.isArray(parsed[0].events))) return true;
  return false;
}

function currentAdapterId() {
  return adapterSelect ? adapterSelect.value : "auto";
}

function applySelectedAdapter(rawEvents, options = {}) {
  const adapterId = currentAdapterId();
  const selectedAdapter = adapters[adapterId] || adapters.auto;
  return selectedAdapter.transform(rawEvents, options);
}

function processIncomingTraceData(rawContent, fileName, shouldAutoApply = true) {
  let parsedData;
  if (typeof rawContent === "string") {
    try {
      parsedData = JSON.parse(rawContent.trim());
    } catch {
      parsedData = rawContent;
    }
  } else {
    parsedData = rawContent;
  }

  if (isMultiTraceData(parsedData)) {
    modeSelect.value = "compare";
    modeSelect.dispatchEvent(new Event("change"));
    loadComparison(parsedData.comparison || parsedData, parsedData.name || fileName);
  } else {
    modeSelect.value = "single";
    modeSelect.dispatchEvent(new Event("change"));
    const rawEventsList = parseTrace(typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent));
    const adaptedEvents = applySelectedAdapter(rawEventsList);
    prepareTraceMapping(adaptedEvents, fileName, shouldAutoApply);
  }
}

if (adapterSelect) {
  adapterSelect.addEventListener("change", () => {
    if (pendingRawEvents && pendingRawEvents.length > 0) {
      processIncomingTraceData(pendingRawEvents, pendingTraceName, true);
    }
  });
}

async function handleFile(file) {
  const text = await file.text();
  processIncomingTraceData(text, file.name, true);
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
  loadSelectedSample();
});

clearBtn.addEventListener("click", clearTrace);

applyMappingBtn.addEventListener("click", applyCurrentMapping);

[colorMode, showLabels, showGrid, timeSlider].forEach((control) => {
  control.addEventListener("input", updateViewerOptions);
  control.addEventListener("change", updateViewerOptions);
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
  zoomInBtn.addEventListener("click", () => {
    if (currentMode === "compare") comparisonViewer.zoomIn();
    else viewer.zoomIn();
  });
  zoomOutBtn.addEventListener("click", () => {
    if (currentMode === "compare") comparisonViewer.zoomOut();
    else viewer.zoomOut();
  });
  zoomResetBtn.addEventListener("click", () => {
    if (currentMode === "compare") comparisonViewer.resetZoom();
    else viewer.resetZoom();
  });
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
  loadSelectedSample();
});

function updateSampleSelectOptions() {
  if (currentMode === "compare") {
    sampleSelect.innerHTML = `
      <option value="debugging_comparison">代码修复任务对比</option>
    `;
  } else {
    sampleSelect.innerHTML = `
      <option value="debug">调试修复</option>
      <option value="minimal">最小字段</option>
      <option value="aliases">字段别名</option>
      <option value="llm">LLM 调用</option>
      <option value="browser">浏览器 Agent</option>
      <option value="business">业务审批</option>
    `;
  }
}

function loadSelectedSample() {
  clearCropState();
  if (currentMode === "compare") {
    const sample = sampleComparisons[sampleSelect.value] || sampleComparisons.debugging_comparison;
    loadComparison(sample.comparison, sample.name);
  } else {
    const sample = sampleTraces[sampleSelect.value] || sampleTraces.debug;
    prepareTraceMapping(sample.events, sample.name, true);
  }
}

function loadComparison(comp, name) {
  activeComparison = comp;
  events = []; // Clear single trace events
  timeSlider.value = "100";
  trackName.textContent = name;
  trackMeta.textContent = `包含 ${comp.traces.length} 条对比轨迹`;
  emptyState.hidden = true;
  mappingPanel.hidden = true;
  
  renderFindingsPanel(comp.findings || []);
  updateStatsForComparison(comp);
  comparisonViewer.setComparison(comp);
  draw();
}

function updateStatsForComparison(comp) {
  statsGrid.querySelectorAll("dt").forEach((node, index) => {
    const labels = ["轨迹数", "里程碑", "差异发现", "均耗时"];
    node.textContent = labels[index];
  });
  
  const values = [
    comp.traces.length.toLocaleString("zh-CN"),
    (comp.anchors || []).length.toLocaleString("zh-CN"),
    (comp.findings || []).length.toLocaleString("zh-CN"),
    formatDuration(comp.metrics?.avg_duration_ms || 0)
  ];
  
  statsGrid.querySelectorAll("dd").forEach((node, index) => {
    node.textContent = values[index];
  });
}

function renderFindingsPanel(findings) {
  findingsPanel.hidden = false;
  if (!findings || findings.length === 0) {
    findingsList.innerHTML = `<p class="muted">未发现明显异常或差异。</p>`;
    return;
  }
  
  findingsList.innerHTML = findings.map(finding => {
    const severityClass = finding.severity === "critical" ? "danger" : finding.severity === "warning" ? "warn" : "info";
    const badge = finding.severity === "critical" ? "✕" : finding.severity === "warning" ? "!" : "i";
    
    return `
      <div class="finding-card ${severityClass}" data-id="${finding.id}">
        <div class="finding-header">
          <span class="finding-badge">${badge}</span>
          <strong>${escapeHtml(finding.title)}</strong>
        </div>
        <p class="finding-desc">${escapeHtml(finding.description)}</p>
      </div>
    `;
  }).join("");
  
  findingsList.querySelectorAll(".finding-card").forEach(card => {
    card.addEventListener("click", () => {
      const id = card.dataset.id;
      const finding = findings.find(f => f.id === id);
      if (finding && finding.eventRefs.length > 0) {
        const firstRef = finding.eventRefs[0];
        comparisonViewer.selectedTraceId = firstRef.traceId;
        comparisonViewer.selectedEventId = firstRef.eventId;
        
        const event = comparisonViewer.comparison.getEvent(firstRef.traceId, firstRef.eventId);
        if (event) {
          updateDetails(event);
          openDetailSidebar();
        }
        comparisonViewer.draw();
      }
    });
  });
}

modeSelect.addEventListener("change", () => {
  currentMode = modeSelect.value;
  clearCropState();
  
  // Toggle enabled states of viewers
  viewer.enabled = (currentMode === "single");
  comparisonViewer.enabled = (currentMode === "compare");
  
  updateSampleSelectOptions();
  
  if (currentMode === "compare") {
    if (schemeSelectLine) schemeSelectLine.hidden = true;
    if (layoutSelectLine) layoutSelectLine.hidden = true;
    mappingPanel.hidden = true;
    loadSelectedSample();
  } else {
    if (schemeSelectLine) schemeSelectLine.hidden = false;
    if (layoutSelectLine) layoutSelectLine.hidden = false;
    findingsPanel.hidden = true;
    loadSelectedSample();
  }
});

function applyCrop() {
  const resetCropBtn = document.querySelector("#resetCropBtn");
  
  // Collect all crop description labels
  const activeCrops = Object.entries(traceCropRanges)
    .filter(([_, range]) => range && range.startEvent && range.endEvent);
  
  if (activeCrops.length === 0) {
    if (resetCropBtn) resetCropBtn.style.display = "none";
    if (currentMode === "compare") {
      if (originalComparison) {
        const comp = originalComparison;
        originalComparison = null;
        loadComparison(comp, comp.id === "comp-debug-001" ? "代码修复任务对比 (Run A vs Run B vs Run C)" : comp.id);
      }
    } else {
      if (originalEvents && originalEvents.length > 0) {
        const orig = originalEvents;
        originalEvents = null;
        loadTrace(orig.map(e => e.payload), "Agent 调试示例");
      }
    }
    return;
  }
  
  if (resetCropBtn) resetCropBtn.style.display = "inline-flex";
  
  if (currentMode === "compare") {
    if (!originalComparison) {
      originalComparison = activeComparison;
    }
    
    // Crop events inside each trace independently!
    const croppedTraces = originalComparison.traces.map(trace => {
      const range = traceCropRanges[trace.traceId];
      if (!range) return trace;
      
      const t1 = range.startEvent.time;
      const t2 = range.endEvent.time;
      const minTime = Math.min(t1, t2);
      const maxTime = Math.max(t1, t2);
      
      const filteredEvents = trace.events.filter(e => e.time >= minTime && e.time <= maxTime);
      return {
        ...trace,
        events: filteredEvents
      };
    });
    
    const croppedComparison = {
      ...originalComparison,
      traces: croppedTraces
    };
    
    loadComparison(croppedComparison, `🔍 聚焦对比：${originalComparison.metrics?.total_traces || 3}轨迹`);
  } else {
    if (!originalEvents || originalEvents.length === 0) {
      originalEvents = [...events];
    }
    
    const range = traceCropRanges["single"];
    if (range) {
      const t1 = range.startEvent.time;
      const t2 = range.endEvent.time;
      const minTime = Math.min(t1, t2);
      const maxTime = Math.max(t1, t2);
      const croppedEvents = originalEvents.filter(e => e.time >= minTime && e.time <= maxTime);
      loadTrace(croppedEvents.map(e => e.payload), `🔍 聚焦轨迹：${originalEvents[0]?.name || "单轨迹"}`);
    }
  }
}

function resetCrop() {
  traceCropRanges = {};
  traceSelectedEvents = {};
  const resetCropBtn = document.querySelector("#resetCropBtn");
  if (resetCropBtn) resetCropBtn.style.display = "none";
  
  if (currentMode === "compare") {
    if (originalComparison) {
      const comp = originalComparison;
      originalComparison = null;
      loadComparison(comp, comp.id === "comp-debug-001" ? "代码修复任务对比 (Run A vs Run B vs Run C)" : comp.id);
    }
  } else {
    if (originalEvents && originalEvents.length > 0) {
      const orig = originalEvents;
      originalEvents = null;
      loadTrace(orig.map(e => e.payload), "Agent 调试示例");
    }
  }
}

function clearCropState() {
  traceCropRanges = {};
  traceSelectedEvents = {};
  originalEvents = null;
  originalComparison = null;
  const resetCropBtn = document.querySelector("#resetCropBtn");
  if (resetCropBtn) resetCropBtn.style.display = "none";
}

function handleNodeSelection(node, traceId = "single") {
  if (!traceSelectedEvents[traceId]) {
    traceSelectedEvents[traceId] = [];
  }
  
  const selected = traceSelectedEvents[traceId];
  if (selected.length === 0) {
    traceSelectedEvents[traceId] = [node];
  } else if (selected.length === 1) {
    const prev = selected[0];
    const isSame = prev.id === node.id;
    if (isSame) {
      traceSelectedEvents[traceId] = [];
    } else {
      selected.push(node);
    }
  } else {
    traceSelectedEvents[traceId] = [node];
  }
  updateViewerOptions();
}

function handleRangeClick(traceId = "single", e1, e2) {
  if (e1 && e2) {
    if (!traceCropRanges[traceId]) {
      traceCropRanges[traceId] = {};
    }
    traceCropRanges[traceId] = { startEvent: e1, endEvent: e2 };
    applyCrop();
    updateViewerOptions();
  } else {
    traceSelectedEvents[traceId] = [];
    updateViewerOptions();
  }
}

function resetTraceCrop(traceId) {
  if (traceCropRanges[traceId]) {
    delete traceCropRanges[traceId];
    delete traceSelectedEvents[traceId];
    applyCrop();
    updateViewerOptions();
  }
}

// Bind reset button
document.querySelector("#resetCropBtn").addEventListener("click", resetCrop);

// Fullscreen Toggle Controls
const fullscreenBtn = document.querySelector("#fullscreenBtn");
const workspace = document.querySelector(".workspace");

if (fullscreenBtn && workspace) {
  fullscreenBtn.addEventListener("click", () => {
    if (!document.fullscreenElement) {
      workspace.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  });

  document.addEventListener("fullscreenchange", () => {
    setTimeout(resizeCanvas, 50);
  });
}

window.addEventListener("resize", resizeCanvas);

// Initialize
updateSampleSelectOptions();

const urlParams = new URLSearchParams(window.location.search);
const cliFilePath = urlParams.get("file");
const cliAdapter = urlParams.get("adapter");

if (cliAdapter && adapterSelect && adapters[cliAdapter]) {
  adapterSelect.value = cliAdapter;
}

if (cliFilePath) {
  if (trackMeta) trackMeta.textContent = `正在通过命令行载入文件: ${cliFilePath.split("/").pop()}...`;
  fetch(`/api/load-file?path=${encodeURIComponent(cliFilePath)}`)
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      return res.text();
    })
    .then(rawContent => {
      const fileName = cliFilePath.split("/").pop() || "命令行轨迹文件";
      processIncomingTraceData(rawContent, fileName, true);
    })
    .catch(err => {
      console.error("CLI file auto-load error:", err);
      if (trackMeta) trackMeta.textContent = `载入失败: ${err.message}`;
      prepareTraceMapping(sampleTraces.debug.events, sampleTraces.debug.name, true);
    });
} else {
  prepareTraceMapping(sampleTraces.debug.events, sampleTraces.debug.name, true);
}
