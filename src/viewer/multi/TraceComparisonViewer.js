import { laneSchemes, statusColors, laneSchemes as traceLaneSchemes } from "../../config/traceConfig.js";
import { layoutComparison } from "../../layouts/multi/comparisonLayout.js";
import { normalizeComparison } from "../../core/comparisonModel.js";

export class TraceComparisonViewer {
  constructor(canvas, options = {}) {
    this.canvas = typeof canvas === "string" ? document.querySelector(canvas) : canvas;
    this.ctx = this.canvas.getContext("2d");
    
    this.rawComparison = null;
    this.comparison = null;
    
    this.positioned = {
      positionedTraces: [],
      positionedAnchors: [],
      positionedSegments: [],
      traceYPositions: []
    };
    
    this.hoverTraceId = null;
    this.hoverEventId = null;
    this.selectedTraceId = null;
    this.selectedEventId = null;
    
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
      progress: 100,
      colorMode: "type",
      showLabels: true,
      showGrid: true,
      selectedEvents: [],
      traceSelectedEvents: {},
      traceCropRanges: {},
      onNodeClick: () => {},
      onNodeHover: () => {},
      onRender: () => {},
      onTraceResetClick: () => {},
      ...options
    };

    this.enabled = true;
    this.bindEvents();
    this.resize();
  }

  setComparison(comparison, fieldMapping = null) {
    this.rawComparison = comparison;
    this.comparison = normalizeComparison(comparison, fieldMapping);
    this.selectedTraceId = null;
    this.selectedEventId = null;
    this.hoverTraceId = null;
    this.hoverEventId = null;
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

  clampViewport() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    // Limit horizontal panning to keep contents visible
    this.offsetX = Math.max(-width * 1.5, Math.min(width * 0.5, this.offsetX));
    this.offsetY = Math.max(-height * 0.5, Math.min(height * 0.5, this.offsetY));
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

  /**
   * Filters events, anchors, and segments based on the current progress cutoff time.
   */
  getVisibleElements() {
    if (!this.comparison || !this.comparison.traces.length) {
      return { visibleTraces: [], visibleAnchors: [], visibleSegments: [] };
    }

    // 1. Find absolute min & max times across all traces to compute cutoffTime
    const allEvents = this.comparison.traces.flatMap(t => t.events);
    if (!allEvents.length) {
      return { visibleTraces: [], visibleAnchors: [], visibleSegments: [] };
    }

    const times = allEvents.map(e => e.time);
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const cutoffTime = minTime + (maxTime - minTime) * (Number(this.options.progress) / 100);

    // 2. Filter trace events
    const visibleTraces = this.positioned.positionedTraces.map(trace => {
      const events = trace.events.filter(e => e.time <= cutoffTime);
      return { ...trace, events };
    });

    // 3. Filter anchors
    const visibleAnchors = this.positioned.positionedAnchors.filter(anchor => {
      return anchor.eventRefs.some(ref => ref.event.time <= cutoffTime);
    });

    // 4. Filter segments
    const visibleSegments = this.positioned.positionedSegments.filter(seg => {
      // Draw segment if at least one referenced event is visible
      return seg.eventRefs.some(ref => ref.event.time <= cutoffTime);
    });

    return { visibleTraces, visibleAnchors, visibleSegments, cutoffTime };
  }

  draw() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const ctx = this.ctx;

    this.clampViewport();
    ctx.clearRect(0, 0, width, height);
    
    // Draw background (Light Theme)
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, width, height);

    if (!this.comparison || !this.comparison.traces.length) {
      this.drawEmptyState(width, height);
      return;
    }

    // 1. Calculate positions in world space
    // Standard layout uses viewport width and height as dimensions
    this.positioned = layoutComparison({
      comparison: this.comparison,
      width: Math.max(800, width),
      height: Math.max(400, height)
    });

    const { visibleTraces, visibleAnchors, visibleSegments, cutoffTime } = this.getVisibleElements();

    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);

    // 2. Draw backgrounds (Translucent overlays for differences / segments)
    this.drawSegmentOverlays(visibleSegments);
    
    // 3. Draw horizontal lanes/tracks backgrounds
    this.drawTrackLanes(visibleTraces, Math.max(800, width));

    // 4. Draw Anchor Pillars (Milestone vertical aligned lines)
    this.drawAnchorPillars(visibleAnchors, height);

    // 5. Draw connections/flows inside each trace
    this.drawTrackFlowLines(visibleTraces);

    // 6. Draw Range Highlight if selected
    this.drawRangeHighlight();

    // 7. Draw Event Nodes
    visibleTraces.forEach(trace => {
      trace.events.forEach(event => {
        const isHovered = this.hoverTraceId === trace.traceId && this.hoverEventId === event.id;
        const selectedList = this.options.traceSelectedEvents 
          ? this.options.traceSelectedEvents[trace.traceId] 
          : null;
        const isSelected = selectedList 
          ? selectedList.some(se => se.id === event.id)
          : (this.selectedTraceId === trace.traceId && this.selectedEventId === event.id);
        this.drawEventNode(event, isHovered || isSelected);
      });
    });

    ctx.restore();

    // 7. Draw screen overlays (Sticky labels on left, headers)
    this.drawScreenOverlays(visibleTraces, width, height);

    // 8. Trigger render callback
    const lastEvent = allVisibleEventsSorted(visibleTraces).at(-1);
    this.options.onRender(lastEvent, { visibleTraces, visibleAnchors, visibleSegments, cutoffTime });
  }

  drawEmptyState(width, height) {
    const ctx = this.ctx;
    ctx.fillStyle = "#94a3b8";
    ctx.font = "14px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("未加载多轨迹对比数据", width / 2, height / 2);
  }

  drawSegmentOverlays(visibleSegments) {
    const ctx = this.ctx;
    const numTraces = this.positioned.positionedTraces.length;
    if (numTraces === 0) return;

    // Retrieve usableWidth from positioned object if available, default to canvas client width minus margins
    const usableWidth = (this.positioned.width || this.canvas.clientWidth) - 230 - 80;

    visibleSegments.forEach(seg => {
      let fillColor = "rgba(148, 163, 184, 0.04)"; // Default info
      let strokeColor = "rgba(148, 163, 184, 0.15)";
      
      if (seg.severity === "critical") {
        fillColor = "rgba(239, 68, 68, 0.05)"; // Red
        strokeColor = "rgba(239, 68, 68, 0.18)";
      } else if (seg.severity === "warning") {
        fillColor = "rgba(245, 158, 11, 0.06)"; // Amber/Orange
        strokeColor = "rgba(245, 158, 11, 0.18)";
      }

      ctx.fillStyle = fillColor;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1 / this.scale;

      // Draw the highlight block per trace lane
      this.positioned.positionedTraces.forEach(trace => {
        if (trace.events.length === 0) return;

        const firstEvent = trace.events[0];
        const lastEvent = trace.events.at(-1);
        const globalMinX = firstEvent.globalX ?? 230;
        const globalMaxX = lastEvent.globalX ?? (230 + usableWidth);
        const globalRange = globalMaxX - globalMinX;

        // Helper to translate globalX to local track X
        const toLocalX = (gx) => {
          if (globalRange <= 0) return 230 + usableWidth / 2;
          return 230 + ((gx - globalMinX) / globalRange) * usableWidth;
        };

        let startX = 230;
        let endX = 230 + usableWidth;
        let hasOverlay = false;

        // 1. If segment has 2 or more anchors, use them (typically matched phases)
        if (seg.anchorIds && seg.anchorIds.length >= 2) {
          const boundAnchors = seg.anchorIds
            .map(anchorId => this.positioned.positionedAnchors.find(a => a.id === anchorId))
            .filter(Boolean)
            .sort((a, b) => a.x - b.x);

          if (boundAnchors.length >= 2) {
            startX = toLocalX(boundAnchors[0].x);
            endX = toLocalX(boundAnchors.at(-1).x);
            hasOverlay = true;
          }
        } else {
          // 2. Otherwise (diverged segment with 1 or 0 anchors), try event references for this track first
          const trackRefs = seg.eventRefs ? seg.eventRefs.filter(ref => ref.traceId === trace.traceId) : [];
          if (trackRefs.length > 0) {
            const refEvents = trackRefs
              .map(ref => trace.events.find(e => e.id === ref.eventId))
              .filter(Boolean)
              .sort((a, b) => a.x - b.x);

            if (refEvents.length > 0) {
              // Highlight from first event node to last event node, padded slightly
              startX = refEvents[0].x - 20;
              endX = refEvents.at(-1).x + 20;
              hasOverlay = true;
            }
          } else if (seg.anchorIds && seg.anchorIds.length === 1) {
            // Fall back: if 1 anchor and no specific events on this track, draw from anchor to end
            const anchor = this.positioned.positionedAnchors.find(a => a.id === seg.anchorIds[0]);
            if (anchor) {
              startX = toLocalX(anchor.x);
              endX = 230 + usableWidth;
              hasOverlay = true;
            }
          }
        }

        // Clamp to visible track boundaries
        startX = Math.max(230, Math.min(230 + usableWidth, startX));
        endX = Math.max(230, Math.min(230 + usableWidth, endX));

        if (!hasOverlay || startX >= endX) return;

        const laneH = 70; // Height of the track lane
        const w = endX - startX;
        ctx.fillRect(startX, trace.y - laneH/2, w, laneH);
        
        ctx.beginPath();
        ctx.moveTo(startX, trace.y - laneH/2);
        ctx.lineTo(startX, trace.y + laneH/2);
        ctx.moveTo(endX, trace.y - laneH/2);
        ctx.lineTo(endX, trace.y + laneH/2);
        ctx.stroke();

        // Draw segment label locally above the first lane affected by this segment
        const targetTraces = this.positioned.positionedTraces.filter(t => 
          !seg.eventRefs || 
          seg.eventRefs.length === 0 || 
          seg.eventRefs.some(ref => ref.traceId === t.traceId)
        );
        const shouldDrawLabel = targetTraces.length > 0 && trace.traceId === targetTraces[0].traceId;

        if (this.scale >= 0.65 && seg.label && shouldDrawLabel) {
          ctx.fillStyle = seg.severity === "critical" ? "#b91c1c" : seg.severity === "warning" ? "#b45309" : "#475569";
          ctx.font = `600 ${Math.max(8, 10 / this.scale)}px Inter, system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText(seg.label, startX + w / 2, trace.y - laneH/2 - 6 / this.scale);
        }
      });
    });
  }

  drawTrackLanes(visibleTraces, worldWidth) {
    const ctx = this.ctx;
    const trackHeight = 70;
    
    visibleTraces.forEach(trace => {
      // Draw track background panel
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 1 / this.scale;
      
      this.drawRoundedRect(
        10, 
        trace.y - trackHeight / 2, 
        worldWidth - 20, 
        trackHeight, 
        6, 
        ctx
      );

      // Draw horizontal baseline down the middle of each track
      ctx.strokeStyle = "rgba(226, 232, 240, 0.8)";
      ctx.lineWidth = 1.5 / this.scale;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(220, trace.y);
      ctx.lineTo(worldWidth - 30, trace.y);
      ctx.stroke();
      ctx.setLineDash([]);
    });
  }

  drawAnchorPillars(visibleAnchors, viewportHeight) {
    const ctx = this.ctx;

    visibleAnchors.forEach(anchor => {
      // Draw local vertical dashed lines and label pills within each track lane
      this.positioned.positionedTraces.forEach(trace => {
        const ref = anchor.eventRefs.find(r => r.traceId === trace.traceId);
        if (!ref) return;
        
        const event = trace.events.find(e => e.id === ref.eventId);
        if (!event) return;

        const trackY = trace.y;
        const laneTop = trackY - 35;
        const laneBottom = trackY + 35;

        // 1. Draw local dashed vertical segment for this lane
        ctx.strokeStyle = "rgba(37, 99, 235, 0.22)"; // Faint Royal Blue
        ctx.lineWidth = 1.5 / this.scale;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(event.x, laneTop);
        ctx.lineTo(event.x, laneBottom);
        ctx.stroke();
        ctx.setLineDash([]);

        // 2. Draw Anchor Pill Label locally at the bottom boundary of this lane (laneBottom)
        ctx.save();
        ctx.translate(event.x, laneBottom);
        
        ctx.fillStyle = "#eff6ff"; // Blue 50
        ctx.strokeStyle = "#bfdbfe"; // Blue 200
        ctx.lineWidth = 1 / this.scale;
        
        const labelText = anchor.label;
        ctx.font = `bold ${Math.max(8, 9 / this.scale)}px Inter, system-ui, sans-serif`;
        const txtWidth = ctx.measureText(labelText).width;
        const pillW = txtWidth + 10;
        const pillH = 14;

        this.drawRoundedRect(-pillW / 2, -pillH / 2, pillW, pillH, 7, ctx);
        
        ctx.fillStyle = "#1e40af"; // Blue 800
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(labelText, 0, 0);
        ctx.restore();
      });
    });
  }

  drawTrackFlowLines(visibleTraces) {
    const ctx = this.ctx;
    ctx.lineWidth = 2.5 / this.scale;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    visibleTraces.forEach(trace => {
      for (let i = 1; i < trace.events.length; i++) {
        const prev = trace.events[i - 1];
        const curr = trace.events[i];
        ctx.strokeStyle = this.getConnectionColor(curr);
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(curr.x, curr.y);
        ctx.stroke();
      }
    });
  }

  drawEventNode(event, isActive) {
    const ctx = this.ctx;
    const nodeColor = this.getNodeColor(event);

    // 1. Draw outer circle border
    ctx.lineWidth = isActive ? 4 / this.scale : 2 / this.scale;
    ctx.strokeStyle = isActive ? "#2563eb" : "#ffffff";
    ctx.fillStyle = nodeColor;

    ctx.beginPath();
    ctx.arc(event.x, event.y, event.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 2. Draw White Icon Symbol in Center
    let symbol = "";
    if (event.category === "input") symbol = "💬";
    else if (event.category === "failure" || event.status === "failed") symbol = "✕";
    else if (event.type.includes("llm") || event.type.includes("model") || event.category === "reasoning") symbol = "✦";
    else if (event.category === "execution") symbol = "⚙";
    else if (event.category === "observation") symbol = "✓";

    if (symbol) {
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${Math.max(6, 9 / this.scale)}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(symbol, event.x, event.y);
    }

    // 3. Draw Node Labels
    if (!this.options.showLabels || this.scale < 0.45) return;
    const label = event.name.length > 18 ? `${event.name.slice(0, 16)}...` : event.name;
    
    // Title Label
    ctx.fillStyle = "#0f172a";
    ctx.font = `700 ${Math.max(8, 11 / this.scale)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(label, event.x, event.y - (event.radius + 6) / this.scale);

    // Duration / Status Label
    ctx.fillStyle = event.status === "failed" ? "#dc2626" : "#64748b";
    ctx.font = `${Math.max(7, 9 / this.scale)}px Inter, system-ui, sans-serif`;
    ctx.fillText(
      event.status === "failed" ? "Failed" : formatDuration(event.durationMs), 
      event.x, 
      event.y + (event.radius + 12) / this.scale
    );
  }

  drawScreenOverlays(visibleTraces, width, height) {
    const ctx = this.ctx;
    
    // Draw a left border mask background for Run labels (Sticky sidebar label)
    ctx.fillStyle = "rgba(248, 250, 252, 0.96)";
    ctx.fillRect(0, 0, 220, height);
    
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(220, 0);
    ctx.lineTo(220, height);
    ctx.stroke();

    // Draw Run/Trace Labels
    visibleTraces.forEach(trace => {
      // Transform world Y coordinate of track to screen Y coordinate
      const screenY = trace.y * this.scale + this.offsetY;
      if (screenY >= -30 && screenY <= height + 30) {
        ctx.fillStyle = "#0f172a"; // Slate 900
        ctx.font = "bold 12px Inter, system-ui, sans-serif";
        ctx.textAlign = "left";
        
        // Wrap/truncate name if necessary (wider limit of 24 characters)
        let name = trace.name;
        if (name.length > 24) name = `${name.slice(0, 22)}...`;
        
        ctx.fillText(name, 40, screenY - 2);
        
        ctx.fillStyle = "#64748b"; // Slate 500
        ctx.font = "10px Inter, system-ui, sans-serif";
        ctx.fillText(trace.traceId, 40, screenY + 12);

        // Draw Reset Button if cropped
        const isCropped = this.options.traceCropRanges && this.options.traceCropRanges[trace.traceId];
        if (isCropped) {
          const btnX = 22;
          const btnY = screenY + 3;
          const isHovered = this.hoverTraceId === trace.traceId && this.hoverResetBtn;
          
          ctx.save();
          ctx.beginPath();
          ctx.arc(btnX, btnY, 9, 0, Math.PI * 2);
          ctx.fillStyle = isHovered ? "#eff6ff" : "#f8fafc";
          ctx.strokeStyle = isHovered ? "#3b82f6" : "#cbd5e1";
          ctx.lineWidth = 1;
          ctx.fill();
          ctx.stroke();
          
          // Draw a clean counter-clockwise circular arrow ⟲
          ctx.strokeStyle = isHovered ? "#2563eb" : "#475569";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(btnX, btnY, 4.5, 0.25 * Math.PI, 1.75 * Math.PI); // Open circle
          ctx.stroke();
          
          // Draw arrow head
          ctx.fillStyle = isHovered ? "#2563eb" : "#475569";
          ctx.beginPath();
          const ax = btnX + 4.5 * Math.cos(0.25 * Math.PI);
          const ay = btnY + 4.5 * Math.sin(0.25 * Math.PI);
          ctx.moveTo(ax - 2.5, ay + 2);
          ctx.lineTo(ax + 2, ay - 2.5);
          ctx.lineTo(ax - 2.5, ay - 2.5);
          ctx.fill();
          ctx.restore();
        }
      }
    });

    // Draw topbar background for comparison mode title
    ctx.fillStyle = "rgba(248, 250, 252, 0.94)";
    ctx.fillRect(220, 0, width - 220, 38);
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(220, 38);
    ctx.lineTo(width, 38);
    ctx.stroke();
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

  getNodeColor(event) {
    const lanes = laneSchemes.event_flow;
    const lane = lanes.find((item) => item.key === event.category) || lanes[1];
    
    if (this.options.colorMode === "type") {
      return lane.color;
    }
    if (this.options.colorMode === "status") {
      return statusColors[event.status] || lane.color;
    }
    
    // For time mode in comparison view, calculate progress relative to overall comparison timespan
    const allEvents = this.comparison.traces.flatMap(t => t.events);
    const times = allEvents.map(e => e.time);
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const duration = maxTime - minTime || 1;
    const progress = (event.time - minTime) / duration;
    return interpolateColor("#2563eb", "#16a34a", progress);
  }

  getConnectionColor(event) {
    const lanes = laneSchemes.event_flow;
    const lane = lanes.find((item) => item.key === event.category) || lanes[1];
    
    if (this.options.colorMode === "type") {
      return lane.color;
    }
    if (this.options.colorMode === "status") {
      return statusColors[event.status] || lane.color;
    }
    
    const allEvents = this.comparison.traces.flatMap(t => t.events);
    const times = allEvents.map(e => e.time);
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const duration = maxTime - minTime || 1;
    const progress = (event.time - minTime) / duration;
    return interpolateColor("#2563eb", "#16a34a", progress);
  }

  drawRangeHighlight() {
    if (!this.options.traceSelectedEvents) return;
    
    Object.entries(this.options.traceSelectedEvents).forEach(([traceId, selected]) => {
      if (!selected || selected.length !== 2) return;
      
      const s1 = selected[0];
      const s2 = selected[1];
      
      const trace = this.positioned.positionedTraces.find(t => t.traceId === traceId);
      if (!trace) return;
      
      const p1 = trace.events.find(e => e.id === s1.id);
      const p2 = trace.events.find(e => e.id === s2.id);
      
      if (!p1 || !p2) return;
      
      const ctx = this.ctx;
      const minX = Math.min(p1.x, p2.x);
      const maxX = Math.max(p1.x, p2.x);
      
      // Vertical bounds for this track lane
      const trackY = trace.y;
      const laneH = 75; // Height of the highlight box for this lane
      
      ctx.save();
      ctx.fillStyle = "rgba(37, 99, 235, 0.05)";
      ctx.strokeStyle = "rgba(37, 99, 235, 0.25)";
      ctx.lineWidth = 1.5 / this.scale;
      ctx.setLineDash([4, 4]);
      
      // Draw rectangular highlight for this lane specifically
      ctx.fillRect(minX, trackY - laneH/2, maxX - minX, laneH);
      ctx.beginPath();
      ctx.moveTo(minX, trackY - laneH/2);
      ctx.lineTo(minX, trackY + laneH/2);
      ctx.moveTo(maxX, trackY - laneH/2);
      ctx.lineTo(maxX, trackY + laneH/2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    });
  }

  hitTest(screenX, screenY) {
    const { visibleTraces } = this.getVisibleElements();
    
    // Check reset button for each trace first
    for (let i = 0; i < visibleTraces.length; i++) {
      const trace = visibleTraces[i];
      const isCropped = this.options.traceCropRanges && this.options.traceCropRanges[trace.traceId];
      if (isCropped) {
        const btnScreenY = trace.y * this.scale + this.offsetY + 3 * this.scale;
        const btnScreenX = 22;
        const dist = Math.hypot(screenX - btnScreenX, screenY - btnScreenY);
        if (dist < 12) {
          return { index: -1, traceId: trace.traceId, node: null, isResetBtn: true };
        }
      }
    }

    let hitResult = { index: -1, traceId: null, node: null, isResetBtn: false };
    
    // Check all events in all tracks
    visibleTraces.forEach(trace => {
      trace.events.forEach((event, idx) => {
        const nodeScreenX = event.x * this.scale + this.offsetX;
        const nodeScreenY = event.y * this.scale + this.offsetY;
        const screenRadius = Math.max(8, event.radius * this.scale);
        
        const dist = Math.hypot(nodeScreenX - screenX, nodeScreenY - screenY);
        if (dist < screenRadius + 6) {
          hitResult = {
            index: idx,
            traceId: trace.traceId,
            node: event,
            isResetBtn: false
          };
        }
      });
    });

    return hitResult;
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
      this.hoverTraceId = hit.traceId;
      this.hoverEventId = hit.node ? hit.node.id : null;
      this.hoverResetBtn = hit.isResetBtn;
      
      this.options.onNodeHover(hit.node, { x, y, rect, event });
      this.canvas.style.cursor = (hit.node || hit.isResetBtn) ? "pointer" : "grab";
      this.draw();
    });

    this.on(this.canvas, "pointerup", (event) => {
      if (!this.enabled) return;
      if (!this.isDragging) return;
      this.canvas.releasePointerCapture(event.pointerId);
      this.isDragging = false;
      this.canvas.style.cursor = this.hoverEventId ? "pointer" : "grab";
      
      if (this.hasDragged) return;

      const rect = this.canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const hit = this.hitTest(x, y);
      
      if (hit.isResetBtn) {
        if (this.options.onTraceResetClick) {
          this.options.onTraceResetClick(hit.traceId);
        }
        return;
      }

      if (hit.node) {
        this.selectedTraceId = hit.traceId;
        this.selectedEventId = hit.node.id;
        this.options.onNodeClick(hit.node, hit.traceId);
        this.draw();
      } else {
        const worldY = (y - this.offsetY) / this.scale;
        const worldX = (x - this.offsetX) / this.scale;
        
        let closestTrace = null;
        let minDist = Infinity;
        this.positioned.positionedTraces.forEach(t => {
          const dist = Math.abs(t.y - worldY);
          if (dist < minDist) {
            minDist = dist;
            closestTrace = t;
          }
        });
        
        if (closestTrace && minDist < 50) {
          const traceId = closestTrace.traceId;
          const selected = this.options.traceSelectedEvents 
            ? this.options.traceSelectedEvents[traceId] 
            : null;
            
          if (selected && selected.length === 2) {
            const p1 = closestTrace.events.find(e => e.id === selected[0].id);
            const p2 = closestTrace.events.find(e => e.id === selected[1].id);
            if (p1 && p2) {
              const minX = Math.min(p1.x, p2.x);
              const maxX = Math.max(p1.x, p2.x);
              if (worldX >= minX && worldX <= maxX) {
                if (this.options.onRangeClick) {
                  this.options.onRangeClick(traceId, selected[0], selected[1]);
                }
                return;
              }
            }
          }
          
          if (this.options.onRangeClick) {
            this.options.onRangeClick(traceId, null, null);
          }
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

// Global utility helpers
function allVisibleEventsSorted(visibleTraces) {
  return visibleTraces
    .flatMap(t => t.events)
    .sort((a, b) => a.time - b.time);
}

function formatDuration(ms) {
  if (!ms) return "0 ms";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`;
  return `${(ms / 60000).toFixed(1)} min`;
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
