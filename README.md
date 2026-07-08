# Agent 运行轨迹可视化工具

一个零依赖的本地前端，用于可视化 Agent 运行轨迹：用户请求、模型推理、工具调用、系统观察、错误节点和自定义事件。

## 使用

```bash
cd trajectory-visualizer
npm run dev
```

然后打开 `http://localhost:5173`。

也可以直接打开 `index.html`，但用本地 HTTP 服务更接近部署环境。

## 支持格式

支持 JSON 数组、包含 `events` / `trace` / `steps` / `nodes` 数组的 JSON 对象，以及 JSONL。工具不会要求外部项目使用固定字段名；上传后会扫描实际字段，再由用户把数据字段映射到当前展示方案需要的标准字段。

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

## 字段映射

每种展示方案都有自己的标准字段和必要字段：

- `事件流`: 必须映射 `节点类型`
- `工具时间线`: 必须映射 `工具/动作名称`、`执行状态`
- `LLM 调用链`: 必须映射 `调用名称`、`节点类型`

通用标准字段：

- `type`: 节点真实类型，例如 `user`、`planning`、`llm_call`、`tool_call`、`test_run`、`error`
- `category`: 展示泳道，可选 `input`、`reasoning`、`execution`、`observation`、`failure`
- `name`: 节点名称
- `content`: 详情内容
- `time`: ISO 时间或数字时间戳
- `duration`: 秒；也支持 `duration_ms` / `elapsed_ms`
- `status`: `success`、`running`、`failed`、`skipped`
- `metadata`: 扩展字段对象，适合放 model、tokens、cost、command、exit_code、url、trace_id 等

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

未识别的顶层字段不会丢弃，会自动合并到 `metadata` 展示。

如果不传 `category`，工具会根据 `type` 做基础归类；无法识别时默认放到 `reasoning` 泳道。

页面内置了多组示例：最小字段、字段别名、LLM 调用、浏览器 Agent、业务审批。可以用左侧示例下拉框切换查看不同字段组合的效果。

## 后续可扩展

- 接入真实 Agent 日志导出格式
- 多 run 对比和筛选
- token / cost / latency 统计
- 工具调用输入输出展开和 diff
- 错误路径自动高亮
