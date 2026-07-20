import { normalizeEvents } from "./traceModel.js";

/**
 * Normalizes a raw TraceComparison object, parsing and validating its traces, anchors, segments, and findings.
 * Also builds a reference map for O(1) lookups of events by traceId and eventId.
 * 
 * @param {Object} rawComparison - The raw comparison object from JSON/JS
 * @param {Object} [fieldMapping] - Optional field mappings for trace events
 * @returns {Object} Normalized TraceComparison object
 */
export function normalizeComparison(rawComparison, fieldMapping = null) {
  if (!rawComparison) {
    throw new Error("对比数据不能为空");
  }

  const id = rawComparison.id || `comparison-${Date.now()}`;
  const metrics = rawComparison.metrics || {};
  const metadata = rawComparison.metadata || {};

  // 1. Normalize all traces and build a lookup map
  const eventLookup = new Map(); // Key: "traceId:eventId" -> event object
  const traces = (rawComparison.traces || []).map((t, idx) => {
    const traceId = t.traceId || `trace-${idx + 1}`;
    const name = t.name || `Trace ${traceId}`;
    const events = normalizeEvents(t.events || [], fieldMapping);

    events.forEach(event => {
      eventLookup.set(`${traceId}:${event.id}`, event);
    });

    return {
      traceId,
      name,
      events,
      metadata: t.metadata || {}
    };
  });

  // Helper to validate and clean eventRefs
  const filterValidRefs = (refs) => {
    return (refs || [])
      .map(ref => {
        if (!ref.traceId || !ref.eventId) return null;
        const event = eventLookup.get(`${ref.traceId}:${ref.eventId}`);
        if (!event) return null;
        return {
          traceId: ref.traceId,
          eventId: ref.eventId,
          event // Pre-bind the normalized event object for O(1) rendering access
        };
      })
      .filter(Boolean);
  };

  // 2. Normalize and validate anchors
  const anchors = (rawComparison.anchors || []).map((anchor, idx) => {
    const anchorId = anchor.id || `anchor-${idx + 1}`;
    const label = anchor.label || `Milestone ${idx + 1}`;
    const kind = anchor.kind || "custom";
    const eventRefs = filterValidRefs(anchor.eventRefs);

    return {
      id: anchorId,
      label,
      kind,
      eventRefs,
      required: anchor.required !== false,
      confidence: typeof anchor.confidence === "number" ? anchor.confidence : 1.0,
      metadata: anchor.metadata || {}
    };
  }).filter(anchor => anchor.eventRefs.length > 0); // Keep only anchors that reference valid events

  // 3. Normalize and validate segments
  const segments = (rawComparison.segments || []).map((seg, idx) => {
    const segId = seg.id || `segment-${idx + 1}`;
    const label = seg.label || `Segment ${idx + 1}`;
    const kind = seg.kind || "custom";
    const eventRefs = filterValidRefs(seg.eventRefs);
    const anchorIds = seg.anchorIds || [];

    return {
      id: segId,
      label,
      kind,
      eventRefs,
      anchorIds,
      severity: seg.severity || "info",
      summary: seg.summary || "",
      metadata: seg.metadata || {}
    };
  });

  // 4. Normalize and validate findings
  const findings = (rawComparison.findings || []).map((finding, idx) => {
    const findingId = finding.id || `finding-${idx + 1}`;
    const title = finding.title || `Finding ${idx + 1}`;
    const description = finding.description || "";
    const kind = finding.kind || "custom";
    const eventRefs = filterValidRefs(finding.eventRefs);
    const score = typeof finding.score === "number" ? finding.score : 0.5;
    const severity = finding.severity || "info";

    return {
      id: findingId,
      title,
      description,
      kind,
      eventRefs,
      score,
      severity,
      metadata: finding.metadata || {}
    };
  });

  return {
    id,
    metrics,
    metadata,
    traces,
    anchors,
    segments,
    findings,
    // Provide a helper to get event from outside if needed
    getEvent: (traceId, eventId) => eventLookup.get(`${traceId}:${eventId}`)
  };
}
