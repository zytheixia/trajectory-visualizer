# 轨迹可视化工具

一个零依赖的本地轨迹可视化前端，支持 CSV 和 GeoJSON 轨迹导入、播放、速度着色、点位检查和基础统计。

## 使用

```bash
cd trajectory-visualizer
npm run dev
```

然后打开 `http://localhost:5173`。

也可以直接打开 `index.html`，但用本地 HTTP 服务更接近部署环境。

## 支持格式

CSV 需要包含 `lat` 和 `lng` 列，可选 `time` 列：

```csv
lat,lng,time
31.2304,121.4737,2026-07-08T09:00:00Z
```

GeoJSON 支持：

- `LineString`
- `Point`
- `Feature`
- `FeatureCollection`

`Point` 的时间字段会读取 `properties.time` 或 `properties.timestamp`。

## 后续可扩展

- 接入真实地图底图，例如 MapLibre 或 Leaflet
- 支持 GPX / KML
- 多条轨迹对比
- 轨迹抽稀、停留点检测、异常速度检测
