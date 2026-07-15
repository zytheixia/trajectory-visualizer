# 多轨迹对比使用方式

多轨迹对比的目标是同时展示 N 条 agent 轨迹之间的关键相同点、差异点、分叉和合流。这个项目不实现对比算法，只预留稳定的数据接口和 viewer 消费方式。

## 设计原则

单轨迹接入模式是：

```text
外部项目 -> TraceEvent[] -> AgentTraceViewer
```

多轨迹对比也保持同样模式：

```text
外部项目 / 外部算法 -> TraceComparison -> TraceComparisonViewer
```

本项目只关心 `TraceComparison` 的结构，不关心：

- anchor 如何识别。
- segment 如何划分。
- finding 如何排序。
- 是否使用语义模型、规则、人工标注或后端任务。

## 为什么需要 anchor

agent 轨迹不能简单按数组 index 或时间戳对齐。真正有价值的是看多条 trace 是否经过了相同里程碑：

- 是否都收到了同一个用户任务。
- 是否都完成了计划。
- 是否调用了同一个关键工具。
- 是否在某个断点处分叉。
- 是否最终合流到同一个结果。

anchor 就是这些里程碑节点的对齐关系。它是多轨迹对比的核心，而不是 UI 装饰。

## 最小输入

后续 viewer 预期消费：

```js
const comparison = {
  id: "compare-001",
  traces: [
    {
      traceId: "run-a",
      name: "Run A",
      events: eventsA
    },
    {
      traceId: "run-b",
      name: "Run B",
      events: eventsB
    }
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
        { traceId: "run-a", eventId: "a8" },
        { traceId: "run-b", eventId: "b10" }
      ],
      confidence: 0.94
    }
  ]
};
```

这已经足够展示：

- 两条 trace。
- 哪些节点是共同里程碑。
- 哪些 trace 缺失某个里程碑。
- 用户点击 anchor 后定位到相关节点。

## 完整输入

完整结构可以包含 `segments` 和 `findings`：

```js
const comparison = {
  id: "compare-001",
  traces: [
    { traceId: "run-a", name: "Run A", events: eventsA },
    { traceId: "run-b", name: "Run B", events: eventsB },
    { traceId: "run-c", name: "Run C", events: eventsC }
  ],
  anchors: [
    {
      id: "anchor-plan-ready",
      label: "计划完成",
      kind: "plan_ready",
      eventRefs: [
        { traceId: "run-a", eventId: "a2" },
        { traceId: "run-b", eventId: "b3" },
        { traceId: "run-c", eventId: "c2" }
      ],
      confidence: 0.9
    }
  ],
  segments: [
    {
      id: "segment-tool-execution",
      label: "工具执行阶段",
      kind: "diverged",
      anchorIds: ["anchor-plan-ready", "anchor-final"],
      eventRefs: [
        { traceId: "run-a", eventId: "a4" },
        { traceId: "run-b", eventId: "b4" },
        { traceId: "run-b", eventId: "b5" },
        { traceId: "run-c", eventId: "c4" }
      ],
      severity: "warning",
      summary: "Run B 多了一次失败重试"
    }
  ],
  findings: [
    {
      id: "finding-retry",
      title: "Run B 在工具调用后发生重试",
      kind: "failure_diff",
      eventRefs: [
        { traceId: "run-b", eventId: "b4" },
        { traceId: "run-b", eventId: "b5" }
      ],
      score: 0.86,
      severity: "warning"
    }
  ]
};
```

## 预期 viewer API

未来的 `TraceComparisonViewer` 可以保持和 `AgentTraceViewer` 类似：

```js
import { TraceComparisonViewer } from "trajectory-visualizer";

const viewer = new TraceComparisonViewer(document.querySelector("#compareCanvas"), {
  layoutKey: "aligned-lanes",
  onAnchorClick: (anchor) => {
    renderAnchorDetail(anchor);
  },
  onFindingClick: (finding) => {
    renderFindingDetail(finding);
  },
  onNodeClick: (node, context) => {
    renderNodeDetail(node, context);
  }
});

viewer.setComparison(comparison);
```

这个 API 还没有实现，目前是预留方向。

## 展示方案

第一版建议做“多轨迹并排 + anchor 竖线 + finding 列表”：

```text
Run A: start ---- plan ---- tool success -------- final
Run B: start ---- plan ---- tool failed -> retry - final
Run C: start ---- plan -------- skipped tool ----- final
       |          |                              |
    anchor     anchor                         anchor
```

这种展示适合 2 到 5 条 trace。N 更大时需要筛选、聚类或摘要视图，但数据结构不需要变化。

后续可以扩展：

| 展示方式 | 用途 |
| --- | --- |
| `aligned-lanes` | 多条 trace 横向对齐，anchor 用竖线连接。 |
| `branch-merge` | 展示共同路径、分叉路径和合流点。 |
| `diff-table` | 按 anchor / segment 生成结构化对照表。 |
| `finding-focus` | 以 finding 列表驱动图上高亮。 |

## 接入方算法输出建议

算法可以任意实现，但输出时建议遵守：

- 所有节点引用都用 `EventRef`。
- anchor 尽量表示语义里程碑，不要只表示第几个节点。
- `confidence` 表示对齐可信度，方便 UI 做弱匹配提示。
- `required: false` 可表示可选节点，例如人工确认、安全检查、缓存命中。
- `finding.score` 表示重要性，不等于可信度。
- `severity` 表示展示上的风险程度。
- 原始算法细节放进 `metadata`，不要污染顶层字段。

## 与单轨迹的关系

`TraceComparison.traces[].events` 仍然是 `TraceEvent[]`。这意味着：

- 单条 trace 可以单独放进 `AgentTraceViewer`。
- 多条 trace 可以组合成 `TraceComparison`。
- adapter 和字段映射逻辑可以复用。
- 对比算法可以在本项目外部独立演进。
