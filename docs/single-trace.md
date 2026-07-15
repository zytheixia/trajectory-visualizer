# 单轨迹使用方式

单轨迹是当前已经实现的主要能力。接入方把自己的 agent 日志转换成 `TraceEvent[]`，然后交给 `AgentTraceViewer`。

## 最小接入

接入方项目通过本地包安装：

```json
{
  "dependencies": {
    "trajectory-visualizer": "file:/home/zyt/projects/trajectory-visualizer"
  }
}
```

页面准备一个容器和 canvas：

```html
<div class="trace-panel">
  <canvas id="traceCanvas"></canvas>
</div>
```

```css
.trace-panel {
  width: 100%;
  height: 600px;
}

#traceCanvas {
  width: 100%;
  height: 100%;
  display: block;
}
```

初始化 viewer：

```js
import { AgentTraceViewer } from "trajectory-visualizer";

const viewer = new AgentTraceViewer(document.querySelector("#traceCanvas"), {
  layoutKey: "swimlane",
  schemeKey: "event_flow",
  onNodeClick: (node) => {
    renderDetailPanel(node);
  },
  onNodeHover: (node, context) => {
    renderTooltip(node, context);
  }
});

viewer.setEvents(events);
```

## 标准事件输入

如果接入方已经能直接生成标准结构，可以不使用内置 adapter：

```js
const events = [
  {
    id: "event-1",
    type: "user",
    category: "input",
    name: "用户请求",
    content: "分析失败原因",
    time: Date.parse("2026-07-08T09:00:00Z"),
    status: "success",
    actor: "User",
    metadata: {},
    payload: originalLog
  },
  {
    id: "event-2",
    type: "tool_call",
    category: "execution",
    name: "pytest",
    content: "运行测试",
    time: Date.parse("2026-07-08T09:00:05Z"),
    durationMs: 8200,
    status: "failed",
    parentId: "event-1",
    actor: "Tool",
    metadata: {
      command: "pytest tests/test_parser.py",
      exit_code: 1
    },
    payload: originalLog
  }
];

viewer.setEvents(events);
```

## 字段映射输入

如果原始字段只是命名不同，可以用 `createMappingAdapter`：

```js
import { AgentTraceViewer, createMappingAdapter } from "trajectory-visualizer";

const adapter = createMappingAdapter({
  id: "event_id",
  type: "kind",
  category: "phase",
  name: "title",
  content: "message",
  time: "started_at",
  duration: "elapsed_ms",
  status: "outcome",
  parent: "parent_id",
  actor: "agent_name",
  metadata: "extra"
});

const events = adapter(rawEvents);
viewer.setEvents(events);
```

字段映射适合字段名不同但语义相近的场景。如果原始日志需要复杂合并、拆分、推断或清洗，建议接入方自己写 adapter，再输出 `TraceEvent[]`。

## 解析上传文件

demo 页面支持 JSON、包含 `events` / `trace` / `steps` / `nodes` 数组的 JSON 对象，以及 JSONL。接入方也可以直接复用：

```js
import { parseTrace, createMappingAdapter } from "trajectory-visualizer";

const rawEvents = parseTrace(fileText);
const events = createMappingAdapter(mapping)(rawEvents);
viewer.setEvents(events);
```

## 布局

当前 viewer 支持多种 `layoutKey`：

| layoutKey | 用途 |
| --- | --- |
| `swimlane` | 按输入、推理、执行、观察、失败等泳道展示。 |
| `tree` | 按 `parentId` 展示分支，适合断点、重试、回滚、多路径。 |
| `interaction` | 按 `actor` 分列，适合多 agent、多角色、多工具交互。 |
| `waterfall` | 按时间和耗时展示 span 风格轨迹。 |

切换布局：

```js
viewer.setOptions({
  layoutKey: "tree"
});
```

## 展示方案

`schemeKey` 决定泳道、字段映射提示和展示语义：

| schemeKey | 用途 |
| --- | --- |
| `event_flow` | 通用 agent 运行轨迹。 |
| `tool_timeline` | 强调工具调用、命令执行、结果和错误。 |
| `llm_trace` | 强调模型调用、prompt、token、cost、latency。 |

```js
viewer.setOptions({
  schemeKey: "llm_trace"
});
```

## ViewerOptions

常用选项：

```ts
type ViewerOptions = {
  layoutKey?: string;
  schemeKey?: string;
  colorMode?: string;
  showLabels?: boolean;
  showGrid?: boolean;
  progress?: number;
  worldWidth?: number | null;
  onNodeClick?: (node, context) => void;
  onNodeHover?: (node, context) => void;
  onRender?: (node, context) => void;
};
```

说明：

- `progress`: 0 到 100，用于按进度展示部分节点。
- `worldWidth`: 图世界宽度，适合节点很多时横向滚动。
- `onNodeClick`: 接入方在这里打开自己的详情面板。
- `onNodeHover`: 接入方在这里展示自己的 tooltip。
- `onRender`: 每次渲染后回调，可用于更新时间轴信息。

## 生命周期

如果页面会卸载 viewer，需要调用：

```js
viewer.destroy();
```

这会移除 viewer 绑定的事件监听，避免在单页应用里重复挂载导致泄漏。

## 与 demo 的关系

demo 页面提供完整工具体验，但它不是库 API。外部项目应该只使用：

```js
import {
  AgentTraceViewer,
  createMappingAdapter,
  normalizeEvents,
  parseTrace,
  discoverFields
} from "trajectory-visualizer";
```

详情栏、字段映射 UI、筛选、统计和存储都建议放在接入方项目里。
