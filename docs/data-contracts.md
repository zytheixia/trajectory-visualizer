# 数据契约

这个文档描述 viewer 消费的数据结构。接入方可以使用任意原始日志格式，只要最终转换成这些结构即可。

## TraceEvent

`TraceEvent` 是单条轨迹里的标准节点。

```ts
type TraceEvent = {
  id: string;
  type: string;
  category: string;
  name: string;
  content?: string;
  time: number;
  durationMs?: number;
  status?: "success" | "failed" | "error" | "running" | string;
  parentId?: string;
  actor?: string;
  metadata?: Record<string, unknown>;
  payload?: unknown;
};
```

字段说明：

| 字段 | 必要 | 说明 |
| --- | --- | --- |
| `id` | 是 | 节点唯一 ID。没有时归一化层会生成。 |
| `type` | 是 | 节点类型，例如 `user`、`planning`、`llm_call`、`tool_call`、`final_answer`。 |
| `category` | 是 | 展示分类，例如 `input`、`reasoning`、`execution`、`observation`、`failure`。 |
| `name` | 是 | 节点展示名称。 |
| `content` | 否 | 节点详情摘要。 |
| `time` | 是 | 数字时间。可以来自时间戳或原始顺序。 |
| `durationMs` | 否 | 节点耗时，单位毫秒。 |
| `status` | 否 | 状态，例如 `success`、`running`、`failed`、`skipped`。 |
| `parentId` | 否 | 父节点 ID，用于树状、分支、回滚、重试展示。 |
| `actor` | 否 | 参与方，例如 `User`、`Agent`、`Tool`、`Reviewer`。 |
| `metadata` | 否 | 扩展字段，例如 model、tokens、cost、command、url、trace_id。 |
| `payload` | 否 | 原始事件，方便接入方详情面板读取。 |

## 字段映射

如果原始数据字段名和标准字段不同，可以使用字段映射：

```ts
type FieldMapping = Record<string, string | string[]>;
```

示例：

```js
const mapping = {
  id: "event_id",
  type: "kind",
  name: "title",
  content: "message",
  time: "started_at",
  duration: "elapsed_ms",
  status: "outcome",
  parent: "parent_id",
  actor: "agent_name",
  metadata: "extra"
};
```

映射 key 是 viewer 认识的标准字段，value 是原始数据里的路径。路径可以是嵌套路径，例如 `span.id`、`attributes.model`。

## TraceComparison

`TraceComparison` 是后续多轨迹对比 viewer 的输入。对比算法不需要在本项目里实现，只要外部最终输出这个结构即可。

```ts
type TraceComparison = {
  id: string;
  traces: ComparedTrace[];
  anchors: ComparisonAnchor[];
  segments?: ComparisonSegment[];
  findings?: ComparisonFinding[];
  metrics?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};
```

## ComparedTrace

```ts
type ComparedTrace = {
  traceId: string;
  name: string;
  events: TraceEvent[];
  metadata?: Record<string, unknown>;
};
```

`traceId` 是对比范围里的轨迹 ID。所有 `eventRefs` 都通过 `traceId + eventId` 指向具体节点。

## EventRef

```ts
type EventRef = {
  traceId: string;
  eventId: string;
};
```

`EventRef` 是多轨迹对比里的引用单位。不要直接复制节点内容，避免对比结构和原始 trace 数据不同步。

## ComparisonAnchor

anchor 是多条轨迹之间的里程碑对齐点。

```ts
type ComparisonAnchor = {
  id: string;
  label: string;
  kind:
    | "task_start"
    | "plan_ready"
    | "tool_call"
    | "observation"
    | "branch_point"
    | "checkpoint"
    | "task_complete"
    | "manual"
    | "custom"
    | string;
  eventRefs: EventRef[];
  required?: boolean;
  confidence?: number;
  metadata?: Record<string, unknown>;
};
```

设计要点：

- anchor 是语义里程碑，不是简单 index。
- anchor 可以只出现在部分 trace 里。
- 缺失 anchor 本身就是差异。
- anchor 可以由算法生成，也可以由用户手动标记。
- viewer 只消费 anchor，不关心 anchor 的生成算法。

## ComparisonSegment

segment 描述 anchor 之间或一组节点之间的关系。

```ts
type ComparisonSegment = {
  id: string;
  label: string;
  kind:
    | "matched"
    | "inserted"
    | "deleted"
    | "diverged"
    | "converged"
    | "reordered"
    | "custom"
    | string;
  eventRefs: EventRef[];
  anchorIds?: string[];
  severity?: "info" | "warning" | "critical" | string;
  summary?: string;
  metadata?: Record<string, unknown>;
};
```

segment 适合表达：

- 两个 anchor 之间的阶段完全一致。
- 某条 trace 多了重试或人工确认。
- 某条 trace 跳过了关键工具调用。
- 多条 trace 从同一节点分叉，最后又合流。

## ComparisonFinding

finding 是算法或接入方认为值得展示给用户的重点差异。

```ts
type ComparisonFinding = {
  id: string;
  title: string;
  description?: string;
  kind:
    | "latency_diff"
    | "failure_diff"
    | "tool_diff"
    | "branch_diff"
    | "output_diff"
    | "cost_diff"
    | "custom"
    | string;
  eventRefs: EventRef[];
  score?: number;
  severity?: "info" | "warning" | "critical" | string;
  metadata?: Record<string, unknown>;
};
```

finding 用于驱动“重点列表 + 图上定位”。用户点击 finding 后，viewer 可以高亮相关节点、anchor 或 segment。

## 最小对比示例

```js
const comparison = {
  id: "compare-run-a-run-b",
  traces: [
    { traceId: "run-a", name: "Run A", events: eventsA },
    { traceId: "run-b", name: "Run B", events: eventsB }
  ],
  anchors: [
    {
      id: "anchor-start",
      label: "任务开始",
      kind: "task_start",
      eventRefs: [
        { traceId: "run-a", eventId: "a1" },
        { traceId: "run-b", eventId: "b1" }
      ],
      confidence: 1
    },
    {
      id: "anchor-final",
      label: "任务完成",
      kind: "task_complete",
      eventRefs: [
        { traceId: "run-a", eventId: "a9" },
        { traceId: "run-b", eventId: "b11" }
      ],
      confidence: 0.92
    }
  ],
  findings: [
    {
      id: "finding-retry",
      title: "Run B 在工具调用后发生重试",
      kind: "failure_diff",
      eventRefs: [
        { traceId: "run-b", eventId: "b6" },
        { traceId: "run-b", eventId: "b7" }
      ],
      score: 0.86,
      severity: "warning"
    }
  ]
};
```
