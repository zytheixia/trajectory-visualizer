import { laneSchemes } from "../../config/traceConfig.js";

export function activeLanes(schemeKey) {
  return laneSchemes[schemeKey] || laneSchemes.event_flow;
}

export function resolveSchemeLane(event, schemeKey) {
  if (event.status === "failed" || event.status === "error" || event.category === "failure") return "failure";

  if (schemeKey === "tool_timeline") {
    if (
      event.category === "execution" ||
      /tool|execution|cmd|command|bash|edit|read|write|grep|view/i.test(event.type) ||
      /tool|execution|cmd|command|bash|edit|read|write|grep|view/i.test(event.name)
    ) {
      return "tool";
    }
    if (
      event.category === "observation" ||
      /result|output|observation/i.test(event.type) ||
      /result|output|observation/i.test(event.name)
    ) {
      return "result";
    }
    return "context";
  }

  if (schemeKey === "llm_trace") {
    if (["input", "user", "human", "user_message", "task"].includes(event.type) || event.category === "input" || /user input/i.test(event.name)) {
      return "prompt";
    }
    if (
      event.category === "execution" ||
      event.category === "observation" ||
      /retrieval|search|context|memory|tool|read|grep|view|edit|bash|result/i.test(event.type) ||
      /tool|result|read|grep|view|edit|bash/i.test(event.name)
    ) {
      return "context";
    }
    if (
      /llm|model|completion|chat|thought|thinking/i.test(event.type) ||
      /thinking|thought|reasoning/i.test(event.name) ||
      (event.category === "reasoning" && !/agent response/i.test(event.name))
    ) {
      return "model";
    }
    if (/guardrail|check|moderation|validation/i.test(event.type) || /check|guardrail/i.test(event.name)) {
      return "check";
    }
    return "output";
  }

  return event.category;
}

export function layoutEvents({ events, layoutKey, schemeKey, width, height }) {
  if (layoutKey === "tree") return layoutTree(events, schemeKey, width, height);
  if (layoutKey === "interaction") return layoutInteraction(events, width, height);
  if (layoutKey === "waterfall") return layoutWaterfall(events, schemeKey, width, height);
  return layoutSwimlane(events, schemeKey, width, height);
}

function layoutSwimlane(events, schemeKey, width, height) {
  const lanes = activeLanes(schemeKey);
  const left = 130;
  const right = 48;
  const top = 54;
  const bottom = 42;
  const minNodeGap = 110;
  const calculatedWidth = Math.max(width, left + right + Math.max(events.length - 1, 1) * minNodeGap);
  const usableWidth = Math.max(320, calculatedWidth - left - right);
  const usableHeight = Math.max(280, height - top - bottom);
  const laneGap = usableHeight / Math.max(lanes.length - 1, 1);

  return events.map((event, index) => {
    const laneKey = resolveSchemeLane(event, schemeKey);
    const laneIndex = lanes.findIndex((lane) => lane.key === laneKey);
    const stepX = left + (usableWidth * index) / Math.max(events.length - 1, 1);
    return {
      ...event,
      displayLane: laneKey,
      x: stepX,
      y: top + Math.max(laneIndex, 0) * laneGap,
      radius: event.category === "failure" || event.status === "failed" ? 13 : 10
    };
  });
}

function layoutTree(events, schemeKey, width, height) {
  const left = 96;
  const right = 72;
  const top = 64;
  const bottom = 54;
  const byId = new Map(events.map((event, index) => [String(event.id), { event, index }]));
  const depths = new Map();

  function depthFor(event, seen = new Set()) {
    if (!event.parentId || !byId.has(String(event.parentId)) || seen.has(event.id)) return 0;
    seen.add(event.id);
    const parent = byId.get(String(event.parentId)).event;
    return depthFor(parent, seen) + 1;
  }

  events.forEach((event) => depths.set(event.id, depthFor(event)));
  const maxDepth = Math.max(...depths.values(), 1);
  const rowsByDepth = new Map();
  events.forEach((event) => {
    const depth = depths.get(event.id) || 0;
    rowsByDepth.set(depth, [...(rowsByDepth.get(depth) || []), event.id]);
  });

  return events.map((event) => {
    const depth = depths.get(event.id) || 0;
    const siblings = rowsByDepth.get(depth) || [];
    const row = siblings.indexOf(event.id);
    return {
      ...event,
      displayLane: resolveSchemeLane(event, schemeKey),
      treeDepth: depth,
      x: left + (depth / maxDepth) * Math.max(260, width - left - right),
      y: top + ((row + 1) / (siblings.length + 1)) * Math.max(220, height - top - bottom),
      radius: event.category === "failure" || event.status === "failed" ? 13 : 10
    };
  });
}

function layoutInteraction(events, width, height) {
  const left = 88;
  const right = 72;
  const top = 72;
  const bottom = 56;
  const actors = Array.from(new Set(events.map((event) => event.actor)));
  const firstTime = events[0]?.time ?? 0;
  const lastTime = events.at(-1)?.time ?? firstTime + events.length;
  const duration = Math.max(lastTime - firstTime, events.length - 1, 1);

  return events.map((event) => {
    const actorIndex = Math.max(actors.indexOf(event.actor), 0);
    return {
      ...event,
      displayLane: event.actor,
      x: left + (actorIndex / Math.max(actors.length - 1, 1)) * Math.max(280, width - left - right),
      y: top + ((event.time - firstTime) / duration) * Math.max(240, height - top - bottom),
      radius: event.category === "failure" || event.status === "failed" ? 13 : 10
    };
  });
}

function layoutWaterfall(events, schemeKey, width, height) {
  const left = 140;
  const right = 48;
  const top = 60;
  const bottom = 42;
  const usableWidth = Math.max(320, width - left - right);
  const usableHeight = Math.max(280, height - top - bottom);

  const firstTime = events[0]?.time ?? 0;
  const endTimes = events.map((e) => e.time + e.durationMs);
  const lastTime = Math.max(...endTimes, firstTime + 1000);
  const totalDuration = Math.max(lastTime - firstTime, 1);

  const rowGap = Math.min(40, Math.max(24, usableHeight / Math.max(events.length, 1)));

  const byId = new Map(events.map((e, idx) => [String(e.id), { event: e, index: idx }]));
  function depthFor(event, seen = new Set()) {
    if (!event.parentId || !byId.has(String(event.parentId)) || seen.has(event.id)) return 0;
    seen.add(event.id);
    const parent = byId.get(String(event.parentId)).event;
    return depthFor(parent, seen) + 1;
  }

  return events.map((event, index) => {
    const startX = left + ((event.time - firstTime) / totalDuration) * usableWidth;
    const endX = left + ((event.time + event.durationMs - firstTime) / totalDuration) * usableWidth;
    const barWidth = Math.max(12, endX - startX);
    const depth = depthFor(event);

    return {
      ...event,
      displayLane: resolveSchemeLane(event, schemeKey),
      treeDepth: depth,
      x: startX,
      y: top + index * rowGap,
      barWidth,
      radius: 8
    };
  });
}

