# Agent 运行轨迹可视化工具

一个零依赖的本地前端，用于可视化 Agent 运行轨迹：用户请求、模型推理、工具调用、系统观察、错误节点和自定义事件。

## 使用

```bash
cd trajectory-visualizer
npm run dev
```

然后打开 `http://localhost:5173`。

也可以直接打开 `index.html`，但用本地 HTTP 服务更接近部署环境。

## 代码结构

```text
src/
  app.js                  应用组装、DOM 事件、canvas 绘制和交互
  config/
    traceConfig.js        数据方案、字段别名、泳道和状态颜色
    sampleTraces.js       内置示例轨迹
  core/
    traceModel.js         JSON/JSONL 解析、字段扫描、标准节点模型
    adapterTypes.js       adapter 输入输出约定
  adapters/
    identityAdapter.js    标准节点输入的轻量适配
    mappingAdapter.js     字段映射 adapter
    index.js              adapter 统一导出
  layouts/
    layoutEngine.js       泳道、树状分支、角色交互布局计算
  viewer/
    AgentTraceViewer.js   可嵌入的纯图形 viewer，负责 canvas 渲染和图上交互
```

当前拆分原则：

- `config` 只放可配置定义和样例数据
- `core` 不依赖 DOM，只负责把外部数据变成内部事件节点
- `layouts` 不负责绘制，只返回节点坐标和展示泳道
- `viewer` 只负责图形、pan/zoom、hover/click 回调，不负责详情面板和字段映射 UI
- `app.js` 负责把完整工具 UI、字段映射、统计、详情栏和 viewer 串起来

## 嵌入方式

外部项目如果只想嵌入图，可以直接使用 viewer：

```js
import { AgentTraceViewer } from "./src/viewer/AgentTraceViewer.js";

const viewer = new AgentTraceViewer(document.querySelector("#traceCanvas"), {
  layoutKey: "tree",
  schemeKey: "event_flow",
  onNodeClick: (node) => {
    // 外部项目自己决定详情面板放在哪里
  }
});

viewer.setEvents(normalizedEvents);
```

数据适配建议默认放在接入方项目里：接入方把自己的日志转成标准节点，再调用 `viewer.setEvents()`。本项目保留字段映射 UI 和 adapter 扩展点，并可逐步提供常见框架的示例 adapter。

## Adapter

默认建议接入方在自己的项目里维护业务 adapter：

```js
function adaptMyTrace(rawLogs) {
  return rawLogs.map((log) => ({
    id: log.event_id,
    type: log.kind,
    category: log.phase,
    name: log.title,
    content: log.message,
    time: Date.parse(log.started_at),
    durationMs: log.elapsed_ms ?? 0,
    status: log.outcome ?? "success",
    parentId: log.parent_id ?? "",
    actor: log.agent_name ?? "Agent",
    metadata: log.extra ?? {},
    payload: log
  }));
}
```

如果只是字段名不同，可以使用内置 mapping adapter：

```js
import { createMappingAdapter } from "./src/adapters/index.js";

const adapter = createMappingAdapter({
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
});

const events = adapter(rawEvents);
viewer.setEvents(events);
```

## 支持格式

支持 JSON 数组、包含 `events` / `trace` / `steps` / `nodes` 数组的 JSON 对象，以及 JSONL。工具不会要求外部项目使用固定字段名；上传后会扫描实际字段，再由用户把数据字段映射到当前数据方案需要的标准字段。

```json
{
  "events": [
    {
      "type": "user",
      "category": "input",
      "name": "用户请求",
      "content": "分析失败测试",
      "time": "2026-07-08T09:00:00Z",
      "status": "success"
    },
    {
      "type": "test_run",
      "category": "execution",
      "name": "pytest",
      "content": "运行相关测试",
      "duration": 8,
      "status": "failed",
      "metadata": {
        "command": "pytest tests/test_parser.py",
        "exit_code": 1
      }
    }
  ]
}
```

## 数据方案与字段映射

每种数据方案都有自己的标准字段和必要字段：

- `事件流`: 必须映射 `节点类型`
- `工具时间线`: 必须映射 `工具/动作名称`、`执行状态`
- `LLM 调用链`: 必须映射 `调用名称`、`节点类型`

## 布局模式

布局决定同一批节点如何展示：

- `泳道`: 按 Input / Reasoning / Execution / Observation / Failure 等泳道展示
- `树状分支`: 按 `parent` / `parent_id` 关系展示分支，适合断点、回滚、重试和多路径执行
- `角色交互`: 按 `actor` / `speaker` / `participant` 分列，适合多 agent、多工具、多角色之间的交互

通用标准字段：

- `type`: 节点真实类型，例如 `user`、`planning`、`llm_call`、`tool_call`、`test_run`、`error`
- `category`: 展示泳道，可选 `input`、`reasoning`、`execution`、`observation`、`failure`
- `name`: 节点名称
- `content`: 详情内容
- `time`: ISO 时间或数字时间戳
- `duration`: 秒；也支持 `duration_ms` / `elapsed_ms`
- `status`: `success`、`running`、`failed`、`skipped`
- `metadata`: 扩展字段对象，适合放 model、tokens、cost、command、exit_code、url、trace_id 等
- `parent`: 父节点或来源节点，用于树状分支布局
- `actor`: 节点所属角色或参与方，用于角色交互布局

前端会用下面的别名做默认推荐，但最终以用户在映射面板里的选择为准：

- `id`: `id`、`event_id`、`node_id`、`step_id`、`span_id`
- `type`: `type`、`role`、`kind`、`event_type`、`node_type`
- `category`: `category`、`lane`、`group`、`phase`
- `name`: `name`、`title`、`label`、`tool`、`action`
- `content`: `content`、`message`、`text`、`input`、`output`、`summary`
- `time`: `time`、`timestamp`、`started_at`、`created_at`、`ts`
- `duration`: `duration`、`duration_ms`、`elapsed_ms`、`latency_ms`
- `status`: `status`、`outcome`、`state`
- `metadata`: `metadata`、`meta`、`attributes`、`extra`
- `parent`: `parent`、`parent_id`、`parentId`、`source`、`from`、`prev`
- `actor`: `actor`、`speaker`、`participant`、`owner`、`agent_name`、`role`

未识别的顶层字段不会丢弃，会自动合并到 `metadata` 展示。

如果不传 `category`，工具会根据 `type` 做基础归类；无法识别时默认放到 `reasoning` 泳道。

页面内置了多组示例：最小字段、字段别名、LLM 调用、浏览器 Agent、业务审批。可以用左侧示例下拉框切换查看不同字段组合的效果。

## 后续可扩展

- 接入真实 Agent 日志导出格式
- 多 run 对比和筛选
- token / cost / latency 统计
- 工具调用输入输出展开和 diff
- 错误路径自动高亮
