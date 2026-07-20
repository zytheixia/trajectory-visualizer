/**
 * Claude Code / Anthropic SDK JSONL Log Adapter
 * Converts raw nested message content (thinking, tool_use, tool_result, text) into standard TraceEvent objects.
 */
export function claudeAdapter(rawEvents) {
  if (!Array.isArray(rawEvents)) return [];

  const unpacked = [];

  rawEvents.forEach((rawEvent, index) => {
    const message = rawEvent.message || rawEvent;
    const content = message?.content || rawEvent.content;

    if (Array.isArray(content) && content.length > 0) {
      content.forEach((item, subIndex) => {
        if (!item || typeof item !== "object") return;

        if (item.type === "thinking" && item.thinking?.trim()) {
          unpacked.push({
            id: rawEvent.uuid ? `${rawEvent.uuid}-think-${subIndex}` : `event-${index + 1}-think-${subIndex}`,
            type: "thought",
            category: "reasoning",
            name: "Thinking",
            content: item.thinking,
            actor: "Agent",
            time: rawEvent.timestamp || rawEvent.time,
            payload: rawEvent
          });
        } else if (item.type === "tool_use") {
          const toolName = item.name || "Tool";
          const detail = item.input?.command || item.input?.file_path || item.input?.path || item.input?.pattern || "";
          const shortDetail = detail ? detail.split("/").pop() : "";
          unpacked.push({
            id: item.id || (rawEvent.uuid ? `${rawEvent.uuid}-tool-${subIndex}` : `event-${index + 1}-tool-${subIndex}`),
            type: "execution",
            category: "execution",
            name: shortDetail ? `${toolName}: ${shortDetail}` : toolName,
            content: typeof item.input === "object" ? JSON.stringify(item.input, null, 2) : String(item.input || ""),
            actor: "Tool",
            metadata: item.input || {},
            time: rawEvent.timestamp || rawEvent.time,
            payload: rawEvent
          });
        } else if (item.type === "tool_result") {
          const resultStr = typeof item.content === "string"
            ? item.content
            : Array.isArray(item.content)
              ? item.content.map(c => c.text || JSON.stringify(c)).join("\n")
              : JSON.stringify(item.content, null, 2);
          unpacked.push({
            id: item.tool_use_id ? `${item.tool_use_id}-result` : `event-${index + 1}-res-${subIndex}`,
            type: "observation",
            category: "observation",
            name: "Tool Result",
            content: resultStr || "",
            status: item.is_error ? "failed" : "success",
            actor: "Observation",
            time: rawEvent.timestamp || rawEvent.time,
            payload: rawEvent
          });
        } else if (item.type === "text" && item.text?.trim()) {
          const isUser = message.role === "user" || rawEvent.type === "user";
          unpacked.push({
            id: rawEvent.uuid ? `${rawEvent.uuid}-text-${subIndex}` : `event-${index + 1}-text-${subIndex}`,
            type: isUser ? "user" : "agent",
            category: isUser ? "input" : "reasoning",
            name: isUser ? "User Input" : "Agent Response",
            content: item.text,
            actor: isUser ? "User" : "Agent",
            time: rawEvent.timestamp || rawEvent.time,
            payload: rawEvent
          });
        }
      });
    } else {
      // Fallback for standard or un-nested events
      unpacked.push(rawEvent);
    }
  });

  return unpacked;
}
