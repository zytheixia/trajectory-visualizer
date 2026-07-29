# 示例数据目录 (Samples Directory)

本目录收录了用于测试、验证与演示的各种 Agent 运行轨迹 JSON 文件。

---

## 📂 示例文件列表

| 文件名 | 类型 | 说明 |
| --- | --- | --- |
| `rec27K706v8iOY_trace_contract.json` | 真实 Agent 完整轨迹 | 包含 59 个真实执行节点（用户 Prompt、思维链思考、Bash 命令、包含 `isMilestone: true` 的代码修改节点）。 |
| `debug-fix.json` | 调试修复示例 | 演示代码搜索、测试运行、断言失败到修复的全流程。 |
| `minimal.json` | 最小字段示例 | 演示仅提供极简字段时归一化层的兼容能力。 |
| `aliases.json` | 字段别名示例 | 演示非标字段名（如 `started_at`, `elapsed_ms`）通过别名映射自动加载。 |
| `llm-call.json` | LLM 调用示例 | 演示包含 Prompt Token、Completion Token、Cost 和 Guardrails 检查的节点。 |
| `browser-agent.json` | 浏览器 Agent 示例 | 演示包含网页导航、点击元素、截图和文件下载的 Trace 阶段。 |
| `business-approval.json` | 业务审批示例 | 演示包含风控评分、人工审批与限额更新的业务工作流。 |
| `agent-run.json` | 基础 Agent 运行示例 | 包含基本输入输出与工具调用的基础 Trajectory。 |

---

## 🚀 命令行启动方式

任意示例文件均可通过命令行直接一键加载并调起界面：

```bash
# 启动真实 Agent 59 节点轨迹
trace-vis samples/rec27K706v8iOY_trace_contract.json

# 启动调试修复示例
trace-vis samples/debug-fix.json

# 启动 LLM 调用示例
trace-vis samples/llm-call.json
```
