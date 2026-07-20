/**
 * Computes coordinate layout for multi-trace comparison.
 * Aligns milestone nodes vertically and spaces out intermediate nodes.
 * 
 * @param {Object} options - Layout options
 * @param {Object} options.comparison - Normalized TraceComparison object
 * @param {number} options.width - Width of the canvas viewport
 * @param {number} options.height - Height of the canvas viewport
 * @returns {Object} Calculated coordinates for rendering
 */
export function layoutComparison({ comparison, width, height }) {
  const left = 230;   // Left margin for trace names
  const right = 80;   // Right margin
  const top = 70;     // Top margin for headers
  const bottom = 60;  // Bottom margin for timeline info

  const traces = comparison.traces || [];
  const anchors = comparison.anchors || [];

  const numTraces = traces.length;
  let usableWidth = Math.max(300, width - left - right);
  const usableHeight = Math.max(200, height - top - bottom);

  // 1. Calculate Y positions for each trace track
  const trackHeight = 80;
  const trackGap = numTraces > 1 ? (usableHeight - numTraces * trackHeight) / (numTraces - 1) : 0;
  const traceYPositions = traces.map((_, idx) => {
    return top + idx * (trackHeight + Math.max(trackGap, 15)) + trackHeight / 2;
  });

  // Map to quickly find which anchor an event belongs to on a specific trace
  // Key: "traceId:eventId" -> anchorIndex
  const eventToAnchorMap = new Map();
  anchors.forEach((anchor, anchorIdx) => {
    anchor.eventRefs.forEach(ref => {
      eventToAnchorMap.set(`${ref.traceId}:${ref.eventId}`, anchorIdx);
    });
  });

  // 2. Segment events for each trace by anchors
  // Each trace will have A + 1 segments of private events:
  // Segment 0: events before Anchor 0
  // Segment k (1 <= k < A): events between Anchor k-1 and Anchor k
  // Segment A: events after the last Anchor
  const numAnchors = anchors.length;
  const traceSegments = traces.map(trace => {
    const segments = Array.from({ length: numAnchors + 1 }, () => []);
    
    trace.events.forEach(event => {
      const anchorIdx = eventToAnchorMap.get(`${trace.traceId}:${event.id}`);
      if (anchorIdx !== undefined) {
        // This is an anchor event, it serves as a boundary and is not private
        return;
      }
      
      // Determine which segment this private event belongs to
      // Find the first anchor that comes after this event in chronological order
      let assignedSegment = numAnchors; // Default to the last segment
      for (let aIdx = 0; aIdx < numAnchors; aIdx++) {
        const anchor = anchors[aIdx];
        const refForThisTrace = anchor.eventRefs.find(r => r.traceId === trace.traceId);
        if (refForThisTrace) {
          const anchorEvent = trace.events.find(e => e.id === refForThisTrace.eventId);
          if (anchorEvent && event.time < anchorEvent.time) {
            assignedSegment = aIdx;
            break;
          }
        }
      }
      segments[assignedSegment].push(event);
    });

    return segments;
  });

  // 3. For each segment, calculate the maximum number of private events across all traces
  const maxPrivateEventsPerSegment = Array.from({ length: numAnchors + 1 }, (_, segIdx) => {
    return Math.max(...traceSegments.map(tSegs => tSegs[segIdx].length), 0);
  });

  // 4. Calculate Column Indices
  // Each Anchor gets a column index.
  // Each private event slot gets a column index.
  const anchorColumns = [];
  let currentColumnIndex = 0;

  // Segment 0 columns
  currentColumnIndex += maxPrivateEventsPerSegment[0];

  for (let aIdx = 0; aIdx < numAnchors; aIdx++) {
    anchorColumns[aIdx] = currentColumnIndex;
    // Move to next anchor, taking private events of segment aIdx + 1 into account
    currentColumnIndex += 1 + maxPrivateEventsPerSegment[aIdx + 1];
  }

  const totalColumns = currentColumnIndex;

  // Spacing: ensure each column has at least 130px of space
  const minUsableWidth = Math.max(800, totalColumns * 130);
  usableWidth = Math.max(minUsableWidth, width - left - right);

  // Helper to map column to X coordinate
  const colToX = (col) => {
    if (totalColumns <= 1) return left + usableWidth / 2;
    return left + (col / (totalColumns - 1)) * usableWidth;
  };

  // 5. Position events and anchors
  const positionedTraces = traces.map((trace, traceIdx) => {
    const y = traceYPositions[traceIdx];
    
    // First pass: calculate raw column index for each event in this trace
    const eventsWithCols = trace.events.map(event => {
      let col = 0;
      const anchorIdx = eventToAnchorMap.get(`${trace.traceId}:${event.id}`);
      
      if (anchorIdx !== undefined) {
        col = anchorColumns[anchorIdx];
      } else {
        let assignedSegment = numAnchors;
        for (let aIdx = 0; aIdx < numAnchors; aIdx++) {
          const anchor = anchors[aIdx];
          const refForThisTrace = anchor.eventRefs.find(r => r.traceId === trace.traceId);
          if (refForThisTrace) {
            const anchorEvent = trace.events.find(e => e.id === refForThisTrace.eventId);
            if (anchorEvent && event.time < anchorEvent.time) {
              assignedSegment = aIdx;
              break;
            }
          }
        }

        const segmentEvents = traceSegments[traceIdx][assignedSegment];
        const eventIdxInSegment = segmentEvents.indexOf(event);
        const maxSlots = maxPrivateEventsPerSegment[assignedSegment];
        const numEvents = segmentEvents.length;
        const startCol = assignedSegment === 0 ? 0 : anchorColumns[assignedSegment - 1] + 1;

        if (numEvents > 0) {
          const step = maxSlots / numEvents;
          col = startCol + Math.floor(eventIdxInSegment * step);
        }
      }
      return { event, col };
    });

    // Find min and max columns actually present in this trace's events
    const cols = eventsWithCols.map(ec => ec.col);
    const minCol = cols.length > 0 ? Math.min(...cols) : 0;
    const maxCol = cols.length > 0 ? Math.max(...cols) : 0;
    const colRange = maxCol - minCol;

    // Second pass: map columns to X coordinates with local track stretching
    const events = eventsWithCols.map(({ event, col }) => {
      let x = left + usableWidth / 2;
      if (colRange > 0) {
        x = left + ((col - minCol) / colRange) * usableWidth;
      }
      return {
        ...event,
        x,
        y,
        globalX: colToX(col),
        radius: event.category === "failure" || event.status === "failed" ? 13 : 10
      };
    });

    return {
      ...trace,
      y,
      events
    };
  });

  // Calculate coordinates for Anchors
  const positionedAnchors = anchors.map((anchor, anchorIdx) => {
    return {
      ...anchor,
      x: colToX(anchorColumns[anchorIdx])
    };
  });

  // Calculate overlays/segments highlights
  const positionedSegments = (comparison.segments || []).map(seg => {
    let startX = left;
    let endX = left + usableWidth;

    // Use anchors to restrict X boundaries if present
    if (seg.anchorIds && seg.anchorIds.length > 0) {
      const boundAnchors = seg.anchorIds
        .map(id => positionedAnchors.find(a => a.id === id))
        .filter(Boolean)
        .sort((a, b) => a.x - b.x);

      if (boundAnchors.length > 0) {
        startX = boundAnchors[0].x;
        endX = boundAnchors.at(-1).x;
      }
    }

    return {
      ...seg,
      startX,
      endX
    };
  });

  return {
    positionedTraces,
    positionedAnchors,
    positionedSegments,
    traceYPositions,
    width: left + usableWidth + right
  };
}
