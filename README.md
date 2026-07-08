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

支持 JSON 数组、包含 `events` / `trace` / `steps` 数组的 JSON 对象，以及 JSONL。事件字段采用“核心字段 + 扩展字段”的方式：可视化只依赖少量核心字段，其余字段会进入节点详情的扩展区。

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

核心字段：

- `type`: 节点真实类型，例如 `user`、`planning`、`llm_call`、`tool_call`、`test_run`、`error`
- `category`: 展示泳道，可选 `input`、`reasoning`、`execution`、`observation`、`failure`
- `name`: 节点名称
- `content`: 详情内容
- `time`: ISO 时间或数字时间戳
- `duration`: 秒；也支持 `duration_ms` / `elapsed_ms`
- `status`: `success`、`running`、`failed`、`skipped`
- `metadata`: 扩展字段对象，适合放 model、tokens、cost、command、exit_code、url、trace_id 等

兼容字段：`role`、`kind`、`message`、`input`、`output`、`timestamp`、`started_at`。未识别的顶层字段不会丢弃，会自动合并到 `metadata` 展示。

如果不传 `category`，工具会根据 `type` 做基础归类；无法识别时默认放到 `reasoning` 泳道。

## 后续可扩展

- 接入真实 Agent 日志导出格式
- 多 run 对比和筛选
- token / cost / latency 统计
- 工具调用输入输出展开和 diff
- 错误路径自动高亮
