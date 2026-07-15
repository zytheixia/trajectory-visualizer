# 整体架构

Trajectory Visualizer 是一个前端可视化库加 demo 页面。核心目标是让其他项目能把 agent 运行轨迹转换成稳定数据结构，然后嵌入图形 viewer。业务日志格式、业务 adapter、对比算法和详情面板都可以由接入方项目自己维护。

## 设计边界

本项目负责：

- 定义可视化需要的通用数据契约。
- 提供字段映射和轻量归一化能力。
- 提供可嵌入 viewer。
- 提供 demo 页面，用来验证上传、映射、布局、详情展示和示例数据。

本项目不负责：

- 采集 agent 运行日志。
- 固定某一种 agent 框架格式。
- 实现业务侧算法，例如多轨迹相似度、语义匹配、关键节点挖掘。
- 决定接入方页面里的详情栏、配置栏、筛选栏位置。
- 存储数据或提供后端服务。

## 当前模块

```text
src/
  index.js                包入口，导出公开 API
  index.d.ts              TypeScript 类型声明
  app.js                  demo 页面组装层，不作为库 API 使用
  config/
    traceConfig.js        展示方案、字段别名、泳道、状态颜色
    sampleTraces.js       demo 内置样例
  core/
    traceModel.js         JSON/JSONL 解析、字段发现、事件归一化
    adapterTypes.js       adapter 契约版本
  adapters/
    identityAdapter.js    已接近标准结构的数据适配
    mappingAdapter.js     字段映射适配
    index.js              adapter 统一导出
  layouts/
    layoutEngine.js       布局计算，不负责绘制
  viewer/
    AgentTraceViewer.js   单轨迹 canvas viewer
```

## 数据流

单轨迹数据流：

```text
raw trace
  -> parseTrace / user adapter / createMappingAdapter
  -> TraceEvent[]
  -> layoutEvents
  -> AgentTraceViewer
```

多轨迹对比预期数据流：

```text
raw traces[]
  -> user adapters / external comparison algorithm
  -> TraceComparison
  -> TraceComparisonViewer
```

这里的关键约束是：外部算法只需要输出 `TraceComparison`，viewer 不关心算法怎么找到 anchor、segment 或 finding。

## 包入口

外部项目应该从包名导入：

```js
import {
  AgentTraceViewer,
  createMappingAdapter,
  normalizeEvents,
  parseTrace
} from "trajectory-visualizer";
```

当前 `package.json` 暴露：

```json
{
  "exports": {
    ".": "./src/index.js",
    "./styles.css": "./src/styles.css"
  },
  "types": "./src/index.d.ts"
}
```

`src/app.js` 是 demo 页面代码，不从包入口导出。

## Viewer 职责

`AgentTraceViewer` 只处理图：

- 接收标准化后的 `TraceEvent[]`。
- 计算当前布局。
- 绘制节点、连线、泳道和图上辅助信息。
- 提供 pan、zoom、hover、click。
- 通过回调把用户交互交给接入方。

它不处理：

- 上传文件。
- 字段映射 UI。
- 详情面板。
- 统计面板。
- 业务筛选。
- 多轨迹对比算法。

## Demo 职责

`src/app.js` 是完整工具 demo，负责：

- 文件上传和示例选择。
- 字段扫描与映射面板。
- 布局、展示方案、颜色模式、标签、网格、时间进度控制。
- 详情面板和统计面板。
- 卡片视图等非纯图展示。

demo 的价值是验证产品体验，但接入方不应该被迫使用 demo 的 UI 结构。

## 扩展方向

后续扩展建议沿着这些边界增加模块：

```text
src/
  compare/
    comparisonModel.js        多轨迹对比数据归一化和校验
  viewer/
    TraceComparisonViewer.js  多轨迹对比 viewer
  styles/
    viewer.css                纯 viewer 基础样式
    demo.css                  demo 页面样式
```

目前 `src/styles.css` 仍包含 demo 级样式。后续如果要正式发布 npm，建议拆成 `viewer.css` 和 `demo.css`，避免接入方 import 一个过重的页面样式文件。

## 后端需求

当前不需要后端。项目可以作为纯前端包使用：

- 数据由接入方页面传入。
- 文件上传在浏览器内解析。
- 对比算法可以在接入方前端、后端或离线流程里执行。
- viewer 只消费最后的标准数据。

只有当后续需要保存 trace、管理多人协作、运行大模型语义匹配或做长任务分析时，才需要额外后端。
