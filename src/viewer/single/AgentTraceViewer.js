import { laneSchemes, statusColors } from "../../config/traceConfig.js";
import { activeLanes, layoutEvents, resolveSchemeLane } from "../../layouts/single/layoutEngine.js";

export class AgentTraceViewer {
  constructor(canvas, options = {}) {
    this.canvas = typeof canvas === "string" ? document.querySelector(canvas) : canvas;
    this.ctx = this.canvas.getContext("2d");
    this.events = [];
    this.positioned = [];
    this.hoverIndex = -1;
    this.selectedIndex = 0;
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.lastMouseX = 0;
    this.lastMouseY = 0;
    this.hasDragged = false;
    this.disposers = [];
    this.options = {
      layoutKey: "swimlane",
      schemeKey: "event_flow",
      colorMode: "type",
      showLabels: true,
      showGrid: true,
      progress: 100,
      worldWidth: null,
      selectedEvents: [],
      onNodeClick: () => {},
      onNodeHover: () => {},
      onRender: () => {},
      ...options
    };

    this.enabled = true;
    this.bindEvents();
    this.resize();
  }

  setEvents(events) {
    this.events = events;
    this.selectedIndex = 0;
    this.hoverIndex = -1;
    this.resetViewport();
    this.draw();
  }

  setOptions(options) {
    this.options = { ...this.options, ...options };
    this.draw();
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  resetViewport() {
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
  }

  destroy() {
    this.disposers.forEach((dispose) => dispose());
    this.disposers = [];
  }

  on(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    this.disposers.push(() => target.removeEventListener(type, handler, options));
  }

  getWorldWidth(viewportWidth) {
    const minGap = 110;
    const numEvents = this.events.length;
    const calculated = numEvents > 1 ? 130 + 48 + (numEvents - 1) * minGap : viewportWidth;
    const configured = Number(this.options.worldWidth);
    return Math.max(viewportWidth, calculated, Number.isFinite(configured) ? configured : viewportWidth);
  }

  clampViewport() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const worldWidth = this.getWorldWidth(width);
    const minOffsetX = Math.min(0, width - worldWidth * this.scale - 24);
    this.offsetX = Math.max(minOffsetX, Math.min(24, this.offsetX));
    this.offsetY = Math.max(-height * 0.45, Math.min(height * 0.45, this.offsetY));
  }

  zoomAt(screenX, screenY, factor) {
    const worldX = (screenX - this.offsetX) / this.scale;
    const worldY = (screenY - this.offsetY) / this.scale;
    const newScale = Math.max(0.15, Math.min(8, this.scale * factor));
    this.offsetX = screenX - worldX * newScale;
    this.offsetY = screenY - worldY * newScale;
    this.scale = newScale;
    this.clampViewport();
    this.draw();
  }

  zoomIn() {
    const rect = this.canvas.getBoundingClientRect();
    this.zoomAt(rect.width / 2, rect.height / 2, 1.25);
  }

  zoomOut() {
    const rect = this.canvas.getBoundingClientRect();
    this.zoomAt(rect.width / 2, rect.height / 2, 1 / 1.25);
  }

  resetZoom() {
    this.resetViewport();
    this.draw();
  }

  visibleEvents() {
    const visibleCount = Math.max(0, Math.ceil((this.positioned.length * Number(this.options.progress)) / 100));
    return this.positioned.slice(0, visibleCount);
  }

  draw() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const ctx = this.ctx;
    const worldWidth = this.getWorldWidth(width);
    this.clampViewport();
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, width, height);

    this.positioned = layoutEvents({
      events: this.events,
      layoutKey: this.options.layoutKey,
      schemeKey: this.options.schemeKey,
      width: worldWidth,
      height
    });
    const visible = this.visibleEvents();
    if (!visible.length) {
      this.drawStaticBackground(width, height);
      this.options.onRender(null, { visible, positioned: this.positioned });
      return;
    }

    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);
    this.drawWorldBackground(width, height);
    this.drawConnections(visible);
    this.drawRangeHighlight();
    visible.forEach((event, index) => {
      const isSelected = this.isNodeSelected(event);
      const isHovered = index === this.hoverIndex;
      this.drawEvent(event, isSelected || isHovered);
    });
    ctx.restore();

    this.drawScreenOverlays(width, height);
    this.options.onRender(visible.at(-1), { visible, positioned: this.positioned });
  }

  drawStaticBackground(width, height) {
    this.ctx.fillStyle = "#f8fafc";
    this.ctx.fillRect(0, 0, width, height);
  }

  drawWorldBackground(width, height) {
    const ctx = this.ctx;
    const layout = this.options.layoutKey;

    if (layout === "swimlane") {
      const lanes = activeLanes(this.options.schemeKey);
      lanes.forEach((lane, index) => {
        const y = 54 + index * (Math.max(280, height - 96) / Math.max(lanes.length - 1, 1));
        ctx.strokeStyle = index % 2 === 0 ? "rgba(148, 163, 184, 0.25)" : "rgba(148, 163, 184, 0.15)";
        ctx.lineWidth = 1 / this.scale;
        ctx.beginPath();
        ctx.moveTo(-10000, y);
        ctx.lineTo(10000, y);
        ctx.stroke();
      });

      if (this.options.showGrid) {
        ctx.strokeStyle = "rgba(148, 163, 184, 0.08)";
        ctx.lineWidth = 1 / this.scale;
        const worldLeft = -this.offsetX / this.scale;
        const worldRight = (width - this.offsetX) / this.scale;
        const startGrid = Math.floor(worldLeft / 72) * 72;
        for (let x = startGrid; x < worldRight; x += 72) {
          ctx.beginPath();
          ctx.moveTo(x, -10000);
          ctx.lineTo(x, 10000);
          ctx.stroke();
        }
      }
    } else if (layout === "tree") {
      if (this.options.showGrid) {
        ctx.strokeStyle = "rgba(148, 163, 184, 0.1)";
        ctx.lineWidth = 1 / this.scale;
        const worldLeft = -this.offsetX / this.scale;
        const worldRight = (width - this.offsetX) / this.scale;
        const startGrid = Math.floor(worldLeft / 120) * 120;
        for (let x = startGrid; x < worldRight; x += 120) {
          ctx.beginPath();
          ctx.moveTo(x, -10000);
          ctx.lineTo(x, 10000);
          ctx.stroke();
        }
      }
    } else if (layout === "interaction") {
      const actors = Array.from(new Set(this.events.map((event) => event.actor)));
      actors.forEach((actor, index) => {
        const x = 88 + (index / Math.max(actors.length - 1, 1)) * Math.max(280, width - 160);
        ctx.strokeStyle = "rgba(148, 163, 184, 0.18)";
        ctx.lineWidth = 1 / this.scale;
        ctx.beginPath();
        ctx.moveTo(x, -10000);
        ctx.lineTo(x, 10000);
        ctx.stroke();
      });
    } else if (layout === "waterfall") {
      if (this.options.showGrid) {
        ctx.strokeStyle = "rgba(148, 163, 184, 0.08)";
        ctx.lineWidth = 1 / this.scale;
        const worldLeft = -this.offsetX / this.scale;
        const worldRight = (width - this.offsetX) / this.scale;
        const startGrid = Math.floor(worldLeft / 80) * 80;
        for (let x = startGrid; x < worldRight; x += 80) {
          ctx.beginPath();
          ctx.moveTo(x, -10000);
          ctx.lineTo(x, 10000);
          ctx.stroke();
        }
      }
    }
  }

  drawScreenOverlays(width, height) {
    const ctx = this.ctx;
    const layout = this.options.layoutKey;

    if (layout === "swimlane") {
      const lanes = activeLanes(this.options.schemeKey);
      ctx.fillStyle = "rgba(255, 255, 255, 0.94)";
      ctx.fillRect(0, 0, 110, height);
      ctx.strokeStyle = "rgba(226, 232, 240, 0.8)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(110, 0);
      ctx.lineTo(110, height);
      ctx.stroke();

      lanes.forEach((lane, index) => {
        const y = 54 + index * (Math.max(280, height - 96) / Math.max(lanes.length - 1, 1));
        const screenY = y * this.scale + this.offsetY;
        if (screenY >= -20 && screenY <= height + 20) {
          ctx.fillStyle = lane.color;
          ctx.font = "700 12px Inter, system-ui, sans-serif";
          ctx.fillText(lane.label, 16, screenY + 4);
        }
      });
    } else if (layout === "tree") {
      ctx.fillStyle = "rgba(255, 255, 255, 0.94)";
      ctx.fillRect(0, 0, width, 48);
      ctx.strokeStyle = "rgba(226, 232, 240, 0.8)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 48);
      ctx.lineTo(width, 48);
      ctx.stroke();
      ctx.fillStyle = "#475569";
      ctx.font = "700 12px Inter, system-ui, sans-serif";
      ctx.fillText("开始 / Root", Math.max(16, 96 * this.scale + this.offsetX - 40), 30);
      ctx.fillText("执行分支路径 / Branches", Math.max(120, 216 * this.scale + this.offsetX), 30);
    } else if (layout === "interaction") {
      ctx.fillStyle = "rgba(255, 255, 255, 0.94)";
      ctx.fillRect(0, 0, width, 48);
      ctx.strokeStyle = "rgba(226, 232, 240, 0.8)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 48);
      ctx.lineTo(width, 48);
      ctx.stroke();

      const actors = Array.from(new Set(this.events.map((event) => event.actor)));
      actors.forEach((actor, index) => {
        const x = 88 + (index / Math.max(actors.length - 1, 1)) * Math.max(280, width - 160);
        const screenX = x * this.scale + this.offsetX;
        ctx.fillStyle = "#334155";
        ctx.font = "700 12px Inter, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(String(actor), screenX, 30);
        ctx.textAlign = "left";
      });
    } else if (layout === "waterfall") {
      ctx.fillStyle = "rgba(255, 255, 255, 0.94)";
      ctx.fillRect(0, 0, width, 48);
      ctx.strokeStyle = "rgba(226, 232, 240, 0.8)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 48);
      ctx.lineTo(width, 48);
      ctx.stroke();
      ctx.fillStyle = "#475569";
      ctx.font = "700 12px Inter, system-ui, sans-serif";
      ctx.fillText("时序瀑布流 / Trace Span Timeline", 20, 30);
    }
  }

  drawConnections(visible) {
    const ctx = this.ctx;
    const byId = new Map(visible.map((event) => [String(event.id), event]));

    if (this.options.layoutKey === "waterfall") {
      ctx.lineWidth = 1 / this.scale;
      ctx.strokeStyle = "rgba(148, 163, 184, 0.4)";
      ctx.setLineDash([3, 3]);
      for (let index = 0; index < visible.length; index += 1) {
        const current = visible[index];
        const previous = current.parentId && byId.has(String(current.parentId)) ? byId.get(String(current.parentId)) : null;
        if (!previous) continue;
        
        ctx.beginPath();
        // Draw vertical elbow connector from parent to child
        ctx.moveTo(previous.x + 6 / this.scale, previous.y);
        ctx.lineTo(previous.x + 6 / this.scale, current.y);
        ctx.lineTo(current.x, current.y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      return;
    }

    ctx.lineWidth = 2 / this.scale;
    ctx.lineCap = "round";
    for (let index = 0; index < visible.length; index += 1) {
      const current = visible[index];
      const previous = current.parentId && byId.has(String(current.parentId)) ? byId.get(String(current.parentId)) : visible[index - 1];
      if (!previous) continue;
      ctx.strokeStyle = this.getConnectionColor(current, index / Math.max(visible.length - 1, 1));
      ctx.beginPath();
      ctx.moveTo(previous.x, previous.y);
      const midX = previous.x + (current.x - previous.x) * (this.options.layoutKey === "tree" ? 0.55 : 0.5);
      ctx.bezierCurveTo(midX, previous.y, midX, current.y, current.x, current.y);
      ctx.stroke();
    }
  }

  drawEvent(event, isActive) {
    const ctx = this.ctx;
    const lanes = activeLanes(this.options.schemeKey);
    const lane = lanes.find((item) => item.key === event.displayLane) || lanes.find((item) => item.key === resolveSchemeLane(event, this.options.schemeKey)) || lanes[1];
    const categoryLane = laneSchemes.event_flow.find((item) => item.key === event.category);
    const nodeColor = this.getNodeColor(event);

    if (this.options.layoutKey === "waterfall") {
      const barHeight = 14;
      const halfH = barHeight / 2;
      
      // Draw bar background
      ctx.fillStyle = nodeColor + "1a"; // ~10% opacity tint
      ctx.strokeStyle = isActive ? "#0f172a" : nodeColor;
      ctx.lineWidth = isActive ? 3 / this.scale : 1.5 / this.scale;
      
      this.drawRoundedRect(
        event.x, 
        event.y - halfH, 
        event.barWidth, 
        barHeight, 
        4, 
        ctx
      );
      
      // Draw solid start node dot on the left of the bar
      ctx.fillStyle = nodeColor;
      ctx.beginPath();
      ctx.arc(event.x, event.y, 4, 0, Math.PI * 2);
      ctx.fill();
      
      // Write label next to the bar
      if (this.options.showLabels && this.scale >= 0.4) {
        const label = event.name.length > 24 ? `${event.name.slice(0, 22)}...` : event.name;
        ctx.fillStyle = "#0f172a";
        ctx.font = `600 ${Math.max(8, 11 / this.scale)}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(
          `${label} (${formatDuration(event.durationMs)})`, 
          event.x + event.barWidth + 8 / this.scale, 
          event.y
        );
      }
      return;
    }

    // Check if this event is a milestone
    const isMilestone = Boolean(
      event.isMilestone ||
      event.payload?.is_milestone ||
      event.payload?.milestone ||
      event.metadata?.is_milestone ||
      event.type === "milestone" ||
      event.category === "milestone" ||
      (event.payload && event.payload.index !== undefined && event.payload.survived !== undefined)
    );

    if (isMilestone) {
      // Distinct, elegant outer accent ring
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = (isActive ? 3.5 : 2.5) / this.scale;
      ctx.beginPath();
      ctx.arc(event.x, event.y, event.radius + 4, 0, Math.PI * 2);
      ctx.stroke();

      // Top-right amber badge dot
      ctx.fillStyle = "#f59e0b";
      ctx.beginPath();
      ctx.arc(event.x + event.radius * 0.75, event.y - event.radius * 0.75, 4 / this.scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1 / this.scale;
      ctx.stroke();
    }

    // 1. Draw outer circle
    ctx.fillStyle = nodeColor;
    ctx.strokeStyle = isActive ? "#0f172a" : "rgba(255, 255, 255, 0.85)";
    ctx.lineWidth = isActive ? 4 / this.scale : 2 / this.scale;
    ctx.beginPath();
    ctx.arc(event.x, event.y, event.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 2. Draw white symbol in center
    let symbol = "";
    if (event.category === "input") symbol = "💬";
    else if (event.category === "failure" || event.status === "failed") symbol = "✕";
    else if (event.type.includes("llm") || event.type.includes("model") || event.category === "reasoning") symbol = "✦";
    else if (event.category === "execution") symbol = "⚙";
    else if (event.category === "observation") symbol = "✓";

    if (symbol) {
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${Math.max(6, 10 / this.scale)}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(symbol, event.x, event.y);
    }

    // 3. Draw text labels next to circle
    if (!this.options.showLabels || this.scale < 0.45) return;
    const label = event.name.length > 24 ? `${event.name.slice(0, 22)}...` : event.name;
    ctx.fillStyle = "#0f172a";
    ctx.font = `700 ${Math.max(8, 12 / this.scale)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(label, event.x + 16 / this.scale, event.y - 4 / this.scale);
    
    ctx.fillStyle = "#64748b";
    ctx.font = `${Math.max(7, 10 / this.scale)}px Inter, system-ui, sans-serif`;
    ctx.fillText(formatDuration(event.durationMs), event.x + 16 / this.scale, event.y + 10 / this.scale);
  }

  drawRoundedRect(x, y, w, h, r, ctx) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  getConnectionColor(event, progress) {
    const lanes = activeLanes(this.options.schemeKey);
    if (this.options.colorMode === "type") {
      return lanes.find((lane) => lane.key === event.displayLane)?.color || "#1267d8";
    }
    if (this.options.colorMode === "status") {
      return statusColors[event.status] || "#1267d8";
    }
    return interpolateColor("#2563eb", "#16a34a", progress);
  }

  getNodeColor(event) {
    const lanes = activeLanes(this.options.schemeKey);
    const lane = lanes.find((item) => item.key === event.displayLane) || lanes.find((item) => item.key === resolveSchemeLane(event, this.options.schemeKey)) || lanes[1];
    
    if (this.options.colorMode === "type") {
      return lane.color;
    }
    if (this.options.colorMode === "status") {
      return statusColors[event.status] || lane.color;
    }
    const progress = event.index / Math.max(this.positioned.length - 1, 1);
    return interpolateColor("#2563eb", "#16a34a", progress);
  }

  isNodeSelected(event) {
    if (this.options.selectedEvents && this.options.selectedEvents.length > 0) {
      return this.options.selectedEvents.some(se => se.id === event.id);
    }
    return event.index === this.selectedIndex;
  }

  drawRangeHighlight() {
    if (!this.options.selectedEvents || this.options.selectedEvents.length !== 2) return;
    const e1 = this.positioned.find(e => e.id === this.options.selectedEvents[0].id);
    const e2 = this.positioned.find(e => e.id === this.options.selectedEvents[1].id);
    if (!e1 || !e2) return;

    const ctx = this.ctx;
    const minX = Math.min(e1.x, e2.x);
    const maxX = Math.max(e1.x, e2.x);
    const height = this.canvas.clientHeight;

    ctx.save();
    ctx.fillStyle = "rgba(37, 99, 235, 0.05)";
    ctx.strokeStyle = "rgba(37, 99, 235, 0.25)";
    ctx.lineWidth = 1.5 / this.scale;
    ctx.setLineDash([4, 4]);

    ctx.fillRect(minX, 30, maxX - minX, height * 1.5 - 30);
    ctx.beginPath();
    ctx.moveTo(minX, 30);
    ctx.lineTo(minX, height * 1.5);
    ctx.moveTo(maxX, 30);
    ctx.lineTo(maxX, height * 1.5);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  hitTest(screenX, screenY) {
    const visible = this.visibleEvents();
    const isWaterfall = this.options.layoutKey === "waterfall";

    const index = visible.findIndex((item) => {
      const nodeScreenX = item.x * this.scale + this.offsetX;
      const nodeScreenY = item.y * this.scale + this.offsetY;

      if (isWaterfall) {
        const barWidth = item.barWidth * this.scale;
        const halfH = Math.max(8, 7 * this.scale);
        return screenX >= nodeScreenX - 8 && 
               screenX <= nodeScreenX + barWidth + 8 && 
               screenY >= nodeScreenY - halfH - 6 && 
               screenY <= nodeScreenY + halfH + 6;
      } else {
        const screenRadius = Math.max(8, item.radius * this.scale);
        return Math.hypot(nodeScreenX - screenX, nodeScreenY - screenY) < screenRadius + 6;
      }
    });
    return { index, node: index >= 0 ? visible[index] : null };
  }

  bindEvents() {
    this.on(this.canvas, "pointerdown", (event) => {
      if (!this.enabled) return;
      const rect = this.canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      this.isDragging = true;
      this.dragStartX = x;
      this.dragStartY = y;
      this.lastMouseX = event.clientX;
      this.lastMouseY = event.clientY;
      this.hasDragged = false;
      this.options.onNodeHover(null, { x, y, rect, event });
      this.canvas.setPointerCapture(event.pointerId);
      this.canvas.style.cursor = "grabbing";
    });

    this.on(this.canvas, "pointermove", (event) => {
      if (!this.enabled) return;
      const rect = this.canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      if (this.isDragging) {
        const dx = event.clientX - this.lastMouseX;
        const dy = event.clientY - this.lastMouseY;
        this.offsetX += dx;
        this.offsetY += dy;
        this.clampViewport();
        this.lastMouseX = event.clientX;
        this.lastMouseY = event.clientY;
        if (Math.hypot(x - this.dragStartX, y - this.dragStartY) > 4) this.hasDragged = true;
        this.draw();
        return;
      }

      const hit = this.hitTest(x, y);
      this.hoverIndex = hit.index;
      this.options.onNodeHover(hit.node, { x, y, rect, event });
      this.canvas.style.cursor = hit.node ? "pointer" : "grab";
      this.draw();
    });

    this.on(this.canvas, "pointerup", (event) => {
      if (!this.enabled) return;
      if (!this.isDragging) return;
      this.canvas.releasePointerCapture(event.pointerId);
      this.isDragging = false;
      this.canvas.style.cursor = this.hoverIndex >= 0 ? "pointer" : "grab";
      if (this.hasDragged) return;

      const rect = this.canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const hit = this.hitTest(x, y);
      if (hit.node) {
        this.selectedIndex = hit.index;
        this.options.onNodeClick(hit.node, { x, y, rect, event });
        this.draw();
      } else {
        if (this.options.selectedEvents && this.options.selectedEvents.length === 2) {
          const worldX = (x - this.offsetX) / this.scale;
          const e1 = this.positioned.find(e => e.id === this.options.selectedEvents[0].id);
          const e2 = this.positioned.find(e => e.id === this.options.selectedEvents[1].id);
          if (e1 && e2) {
            const minX = Math.min(e1.x, e2.x);
            const maxX = Math.max(e1.x, e2.x);
            if (worldX >= minX && worldX <= maxX) {
              if (this.options.onRangeClick) {
                this.options.onRangeClick("single", this.options.selectedEvents[0], this.options.selectedEvents[1]);
              }
              return;
            }
          }
        }
        if (this.options.onRangeClick) {
          this.options.onRangeClick("single", null, null);
        }
      }
    });

    this.on(this.canvas, "pointercancel", (event) => {
      if (!this.enabled) return;
      if (this.isDragging) {
        this.canvas.releasePointerCapture(event.pointerId);
        this.isDragging = false;
        this.canvas.style.cursor = "grab";
      }
    });

    this.on(
      this.canvas,
      "wheel",
      (event) => {
        if (!this.enabled) return;
        event.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
        if (event.ctrlKey || event.metaKey) {
          this.zoomAt(mouseX, mouseY, event.deltaY < 0 ? 1.08 : 1 / 1.08);
          return;
        }
        const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
        this.offsetX -= delta;
        this.clampViewport();
        this.draw();
      },
      { passive: false }
    );
  }
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

function formatDuration(ms) {
  if (!ms) return "0 ms";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`;
  return `${(ms / 60000).toFixed(1)} min`;
}
