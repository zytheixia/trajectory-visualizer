# Agent 运行轨迹可视化工具

一个零依赖的本地前端，用于可视化 Agent 运行轨迹：用户请求、Agent 思考/规划、工具调用、系统观察、错误节点和最终总结。

## 使用

```bash
cd trajectory-visualizer
npm run dev
```

然后打开 `http://localhost:5173`。

也可以直接打开 `index.html`，但用本地 HTTP 服务更接近部署环境。

## 支持格式

支持 JSON 数组、包含 `events` / `trace` / `steps` 数组的 JSON 对象，以及 JSONL。

```json
{
  "events": [
    {
      "type": "user",
      "name": "用户请求",
      "content": "分析失败测试",
      "time": "2026-07-08T09:00:00Z",
      "status": "success"
    },
    {
      "type": "tool",
      "name": "pytest",
      "content": "运行相关测试",
      "duration": 8,
      "status": "failed"
    }
  ]
}
```

事件字段：

- `type`: `user`、`agent`、`tool`、`system`、`error`
- `name`: 节点名称
- `content`: 详情内容
- `time`: ISO 时间或数字时间戳
- `duration`: 秒；也支持 `duration_ms` / `elapsed_ms`
- `status`: `success`、`running`、`failed`、`skipped`

兼容字段：`role`、`kind`、`message`、`input`、`output`、`timestamp`、`started_at`。

## 后续可扩展

- 接入真实 Agent 日志导出格式
- 多 run 对比和筛选
- token / cost / latency 统计
- 工具调用输入输出展开和 diff
- 错误路径自动高亮
