# 适配器 (Adapter) 架构与扩展指南

本文档面向想要接入自定义运行日志（如 LangChain、OpenAI Assistant API、AutoGen、Claude Code、自定义 Benchmark 日志）的开发者，说明系统的适配器设计架构及如何编写自己的 Adapter。

---

## 核心设计原则

1. **可视化核心 (Core) 保持纯洁与厂商无关**：
   * `src/core/traceModel.js` 和 Canvas 渲染器只消费**标准数据契约**（`TraceEvent` 数组）。
   * 核心代码库严禁包含任何针对特定第三方框架的特化硬编码。
2. **适配器职责独立 (Adapters Layer)**：
   * 所有非标日志格式的解包、提取、分类转换逻辑，统一在 `src/adapters/` 层的 Adapter 中独立完成。
3. **启动与导入时显式/自动选择**：
   * 支持通过命令行参数（如 `--adapter claude`）、前端下拉菜单选择、或自动特征检测（`auto`）来调起对应的 Adapter。

---

## 标准转换目标：TraceEvent

所有 Adapter 的终极目标，都是将输入的任意原始日志数据转换成符合以下 TypeScript 规范的 `TraceEvent[]` 标准数组：

```ts
type TraceEvent = {
  id: string;          // 节点唯一 ID
  type: string;        // 节点类型（例如 "user", "thought", "tool", "observation"）
  category: string;    // 泳道分类（"input" | "reasoning" | "execution" | "observation" | "failure"）
  name: string;        // 节点展示标题（例如 "Bash: find", "Edit: main.go"）
  content?: string;    // 详细文本/输入输出内容/代码预览
  time: number;        // 数字时间戳（ms）或排序序号
  durationMs?: number; // 耗时（ms）
  status?: string;     // 状态（"success" | "failed" | "error" | "running" | "skipped"）
  parentId?: string;   // 父节点 ID（用于调用树与回溯）
  actor?: string;      // 参与方（"User" | "Agent" | "Tool" | "Observation"）
  metadata?: Record<string, unknown>; // 扩展属性（如 command, file_path, tokens 等）
  payload?: unknown;   // 原始事件引用
};
```

---

## 如何编写一个自定义 Adapter

编写 Adapter 非常简单，它本质上是一个纯函数，接收原始事件数组并返回 `TraceEvent[]`。

### 代码结构示例

在 `src/adapters/` 目录下新建您的适配器文件（例如 `src/adapters/myFrameworkAdapter.js`）：

```javascript
/**
 * Custom Framework Log Adapter
 * @param {Array} rawEvents 原始解析后的日志行对象数组
 * @param {Object} [options] 额外选项
 * @returns {Array<TraceEvent>}
 */
export function myFrameworkAdapter(rawEvents, options = {}) {
  if (!Array.isArray(rawEvents)) return [];

  const traceEvents = [];

  rawEvents.forEach((raw, index) => {
    // 1. 提取或生成节点唯一 ID
    const id = raw.id || `event-${index + 1}`;

    // 2. 映射泳道分类 (category)
    // 必须为: "input" | "reasoning" | "execution" | "observation" | "failure" 之一
    let category = "reasoning";
    if (raw.is_input) category = "input";
    else if (raw.tool_name) category = "execution";
    else if (raw.output) category = "observation";

    // 3. 构造标准 TraceEvent 对象
    traceEvents.push({
      id,
      type: raw.type || "agent",
      category,
      name: raw.tool_name ? `Tool: ${raw.tool_name}` : (raw.title || "Agent Step"),
      content: raw.text || raw.content || "",
      time: Date.parse(raw.timestamp) || index,
      durationMs: raw.elapsed_ms || 0,
      status: raw.error ? "failed" : "success",
      actor: category === "input" ? "User" : category === "execution" ? "Tool" : "Agent",
      metadata: { rawData: raw },
      payload: raw
    });
  });

  return traceEvents;
}
```

---

## 注册与接入 Adapter

完成 Adapter 编写后，在 `src/adapters/index.js` 中注册它：

```javascript
import { identityAdapter } from "./identityAdapter.js";
import { createMappingAdapter } from "./mappingAdapter.js";
import { claudeAdapter } from "./claudeAdapter.js";
import { myFrameworkAdapter } from "./myFrameworkAdapter.js";

export const adapters = {
  auto: {
    id: "auto",
    name: "自动识别",
    transform: (events, options) => {
      // 可以在此处加入特征识别逻辑
      if (events.some(e => e.my_framework_flag)) {
        return myFrameworkAdapter(events, options);
      }
      if (events.some(e => e.message || e.sessionId)) {
        return claudeAdapter(events, options);
      }
      return identityAdapter(events, options);
    }
  },
  myFramework: {
    id: "myFramework",
    name: "我的 Agent 框架日志",
    transform: (events, options) => myFrameworkAdapter(events, options)
  },
  claude: {
    id: "claude",
    name: "Claude Code 日志",
    transform: (events) => claudeAdapter(events)
  },
  identity: {
    id: "identity",
    name: "标准格式",
    transform: (events) => identityAdapter(events)
  }
};
```

注册完成后：
1. **前端下拉菜单**：`index.html` 的适配器下拉列表中会自动支持或可通过加 `<option value="myFramework">` 选择。
2. **命令行 CLI**：可以使用 `trace-vis ./my_log.json --adapter myFramework` 直接调起调用。
