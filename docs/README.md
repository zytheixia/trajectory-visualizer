# Trajectory Visualizer 文档

这个目录放项目的长期设计文档。README 只保留快速开始和项目入口；模型、架构、接入方式和后续扩展都在这里单独维护。

## 文档结构

- [整体架构](./architecture.md): 项目边界、模块职责、数据流、包入口和后续扩展原则。
- [数据契约](./data-contracts.md): 单轨迹事件、字段映射、多轨迹对比、anchor、segment、finding 的通用结构。
- [单轨迹使用方式](./single-trace.md): 外部项目如何接入 `AgentTraceViewer`，如何准备数据，如何用字段映射。
- [多轨迹对比使用方式](./comparison-trace.md): 后续 `TraceComparisonViewer` 的预留接口、数据格式和展示方式。

## 维护原则

- 每一种轨迹能力单独维护文档，不把所有用法堆在 README。
- 文档先描述稳定接口，再描述 demo 页面能力。
- 算法不写进本项目文档的核心假设里；本项目只定义算法输出的数据契约和展示消费方式。
- 示例优先使用包名 import：`trajectory-visualizer`，不要让接入方依赖内部文件路径。
- 如果新增 viewer、adapter、layout 或数据模型，需要同步更新 `architecture.md` 和对应使用文档。

## 当前能力状态

| 能力 | 状态 | 主要文档 |
| --- | --- | --- |
| 单轨迹可视化 | 已实现 | [single-trace.md](./single-trace.md) |
| 字段映射 adapter | 已实现 | [single-trace.md](./single-trace.md) |
| 多布局展示 | 已实现 | [single-trace.md](./single-trace.md) |
| 本地包接入 | 已实现 | [architecture.md](./architecture.md) |
| TypeScript 类型声明 | 初步实现 | [data-contracts.md](./data-contracts.md) |
| 多轨迹对比数据契约 | 设计中 | [comparison-trace.md](./comparison-trace.md) |
| 多轨迹对比 viewer | 预留 | [comparison-trace.md](./comparison-trace.md) |
