import { categoryAliases, fieldAliases } from "../config/traceConfig.js";

export function parseTrace(text) {
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

export function normalizeEvents(rawEvents, fieldMapping = null) {
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
        parentId: readField(event, "parent", fieldMapping) || "",
        actor: readField(event, "actor", fieldMapping) || inferActor(type, category),
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

export function discoverFields(rawEvents) {
  const fields = new Set();
  rawEvents.slice(0, 50).forEach((event) => {
    collectPaths(event, "", fields, 2);
  });
  return Array.from(fields).sort((a, b) => a.localeCompare(b));
}

export function readPath(source, path) {
  if (!path) return undefined;
  return String(path)
    .split(".")
    .reduce((value, segment) => (value == null ? undefined : value[segment]), source);
}

export function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeType(value) {
  return String(value || "agent")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function inferActor(type, category) {
  if (category === "input") return "User";
  if (category === "execution") return "Tool";
  if (category === "failure") return "Error";
  if (/llm|model|assistant|agent|thought|plan/i.test(type)) return "Agent";
  return typeLabel(category);
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

function collectPaths(value, prefix, fields, depth) {
  if (!isPlainObject(value) || depth < 0) return;
  Object.entries(value).forEach(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    fields.add(path);
    if (isPlainObject(child)) collectPaths(child, path, fields, depth - 1);
  });
}

function parseTime(value, fallback) {
  if (!value) return fallback;
  const date = Date.parse(value);
  if (Number.isFinite(date)) return date;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function typeLabel(type) {
  return String(type || "agent")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
